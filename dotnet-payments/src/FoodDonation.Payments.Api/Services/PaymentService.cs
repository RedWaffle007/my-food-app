using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FoodDonation.Payments.Api.Configuration;
using FoodDonation.Payments.Api.Contracts;
using FoodDonation.Payments.Api.Data;
using FoodDonation.Payments.Api.Domain;
using FoodDonation.Payments.Api.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FoodDonation.Payments.Api.Services;

/// <summary>Raised for domain/validation failures; mapped to 4xx by the endpoints.</summary>
public class PaymentDomainException : Exception
{
    public int StatusCode { get; }
    public PaymentDomainException(string message, int statusCode = 400) : base(message) => StatusCode = statusCode;
}

/// <summary>
/// The payment/ledger trust boundary. Owns order state, enforces the deposit/ride
/// money invariants, writes the append-only ledger, and drives the gateway through
/// <see cref="IPaymentProvider"/>. The mobile client never moves money directly.
/// </summary>
public class PaymentService
{
    private readonly AppDbContext _db;
    private readonly IPaymentProvider _provider;
    private readonly DepositOptions _deposit;
    private readonly RideOptions _ride;
    private readonly ILogger<PaymentService> _log;

    public PaymentService(
        AppDbContext db,
        IPaymentProvider provider,
        IOptions<DepositOptions> deposit,
        IOptions<RideOptions> ride,
        ILogger<PaymentService> log)
    {
        _db = db;
        _provider = provider;
        _deposit = deposit.Value;
        _ride = ride.Value;
        _log = log;
    }

    public ConfigResponse GetConfig() => new()
    {
        DepositAmount = _deposit.Amount,
        AgentFailedTripMin = _deposit.AgentFailedTripMin,
        RideFee = _ride.Fee,
        AgentRideSharePct = _ride.AgentSharePct,
    };

    public async Task<Payee> RegisterPayeeAsync(RegisterPayeeRequest req, CancellationToken ct)
    {
        var existing = await _db.Payees.FindAsync(new object[] { req.AgentId }, ct);
        var reference = await _provider.RegisterPayeeAsync(new RegisterPayeeInput(req.AgentId, req.Name, req.Email, req.Phone), ct);

        if (existing is null)
        {
            existing = new Payee
            {
                AgentId = req.AgentId,
                ProviderPayeeId = reference.ProviderPayeeId,
                Name = req.Name,
                Email = req.Email,
                Phone = req.Phone,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Payees.Add(existing);
        }
        else
        {
            existing.ProviderPayeeId = reference.ProviderPayeeId;
            existing.Name = req.Name;
            existing.Email = req.Email;
            existing.Phone = req.Phone;
        }
        await _db.SaveChangesAsync(ct);
        return existing;
    }

    // ── Deposit (the edibility gate) ─────────────────────────────────────────

    public async Task<OrderResponse> HoldDepositAsync(HoldDepositRequest req, CancellationToken ct)
    {
        var orderId = $"deposit_{req.BookingId}";
        var existing = await _db.Orders.FindAsync(new object[] { orderId }, ct);
        if (existing is not null)
            return ToResponse(existing);

        var hold = await _provider.HoldDepositAsync(
            new DepositHoldInput(req.BookingId, new Money(_deposit.Amount), req.DonorId, req.DonorEmail, req.DonorPhone), ct);

        var order = new PaymentOrder
        {
            OrderId = orderId,
            BookingId = req.BookingId,
            Kind = OrderKind.Deposit,
            Amount = _deposit.Amount,
            Status = PaymentStatus.Created,
            DepositState = hold.Status,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.Orders.Add(order);
        AppendEvent(req.BookingId, orderId, PaymentEventType.OrderCreated, _deposit.Amount);
        AppendEvent(req.BookingId, orderId, PaymentEventType.DepositHeld, _deposit.Amount);
        await _db.SaveChangesAsync(ct);

        return ToResponse(order, hold.PaymentSessionId);
    }

    public async Task<OrderResponse> ReleaseDepositAsync(string bookingId, CancellationToken ct)
    {
        var order = await LoadOrder($"deposit_{bookingId}", OrderKind.Deposit, ct);
        if (order.DepositState == DepositState.Released)
            return ToResponse(order);
        if (order.DepositState == DepositState.Captured)
            throw new PaymentDomainException("Deposit already captured for a failed trip; cannot release.");

        await _provider.ReleaseDepositAsync(new DepositReleaseInput(order.OrderId, order.OrderId, new Money(order.Amount)), ct);
        order.DepositState = DepositState.Released;
        order.UpdatedAt = DateTime.UtcNow;
        AppendEvent(bookingId, order.OrderId, PaymentEventType.DepositReleased, order.Amount);
        await _db.SaveChangesAsync(ct);
        return ToResponse(order);
    }

    public async Task<OrderResponse> CaptureDepositAsync(string bookingId, CaptureDepositRequest req, CancellationToken ct)
    {
        var order = await LoadOrder($"deposit_{bookingId}", OrderKind.Deposit, ct);
        if (order.DepositState == DepositState.Captured)
            return ToResponse(order);
        if (order.DepositState == DepositState.Released)
            throw new PaymentDomainException("Deposit already released; cannot capture.");

        var payee = await LoadPayee(req.AgentId, ct);

        var agentMinimum = _deposit.AgentFailedTripMin;
        var donorRemainder = order.Amount - agentMinimum; // invariant guarantees >= 0

        await _provider.CaptureDepositForFailedTripAsync(new DepositCaptureInput(
            order.OrderId, order.OrderId,
            new Money(agentMinimum), new Money(donorRemainder),
            new PayeeRef(payee.ProviderPayeeId)), ct);

        order.DepositState = DepositState.Captured;
        order.ProviderPayeeId = payee.ProviderPayeeId;
        order.UpdatedAt = DateTime.UtcNow;
        AppendEvent(bookingId, order.OrderId, PaymentEventType.DepositCaptured, agentMinimum);
        AppendEvent(bookingId, order.OrderId, PaymentEventType.PayoutReleased, agentMinimum);
        if (donorRemainder > 0)
            AppendEvent(bookingId, order.OrderId, PaymentEventType.Refunded, donorRemainder);
        await _db.SaveChangesAsync(ct);
        return ToResponse(order);
    }

    // ── Ride escrow ──────────────────────────────────────────────────────────

    public async Task<OrderResponse> CreateEscrowOrderAsync(CreateEscrowRequest req, CancellationToken ct)
    {
        var orderId = $"order_{req.BookingId}";
        var existing = await _db.Orders.FindAsync(new object[] { orderId }, ct);
        if (existing is not null)
            return ToResponse(existing);

        var payee = await LoadPayee(req.AgentId, ct);
        var result = await _provider.CreateEscrowOrderAsync(new EscrowOrderInput(
            req.BookingId, new Money(_ride.Fee), _ride.AgentSharePct, req.DonorId,
            new PayeeRef(payee.ProviderPayeeId), req.DonorEmail, req.DonorPhone), ct);

        var order = new PaymentOrder
        {
            OrderId = orderId,
            BookingId = req.BookingId,
            Kind = OrderKind.Escrow,
            Amount = _ride.Fee,
            AgentSharePct = _ride.AgentSharePct,
            ProviderPayeeId = payee.ProviderPayeeId,
            Status = result.Status,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.Orders.Add(order);
        AppendEvent(req.BookingId, orderId, PaymentEventType.OrderCreated, _ride.Fee);
        await _db.SaveChangesAsync(ct);
        return ToResponse(order, result.PaymentSessionId);
    }

    public async Task<OrderResponse> ReleasePayoutAsync(string bookingId, PayoutRequest req, CancellationToken ct)
    {
        var order = await LoadOrder($"order_{bookingId}", OrderKind.Escrow, ct);
        if (order.PayoutState == PayoutState.Released)
            return ToResponse(order);

        var payee = await LoadPayee(req.AgentId, ct);
        var agentShare = Math.Round(order.Amount * order.AgentSharePct / 100m, 2);

        var result = await _provider.ReleasePayoutAsync(new PayoutInput(
            bookingId, order.OrderId, new PayeeRef(payee.ProviderPayeeId), new Money(agentShare)), ct);

        order.PayoutState = result.Status;
        order.UpdatedAt = DateTime.UtcNow;
        AppendEvent(bookingId, order.OrderId, PaymentEventType.PayoutReleased, agentShare);
        await _db.SaveChangesAsync(ct);
        return ToResponse(order);
    }

    public async Task<OrderResponse> RefundAsync(string orderId, RefundRequest req, CancellationToken ct)
    {
        var order = await _db.Orders.FindAsync(new object[] { orderId }, ct)
            ?? throw new PaymentDomainException($"Order '{orderId}' not found.", 404);

        await _provider.RefundAsync(new RefundInput(order.OrderId, new Money(req.Amount), req.Reason), ct);
        order.Status = PaymentStatus.Refunded;
        order.UpdatedAt = DateTime.UtcNow;
        AppendEvent(order.BookingId, order.OrderId, PaymentEventType.Refunded, req.Amount);
        await _db.SaveChangesAsync(ct);
        return ToResponse(order);
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    public async Task<OrderResponse?> GetOrderAsync(string orderId, CancellationToken ct)
    {
        var order = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
        return order is null ? null : ToResponse(order);
    }

    public async Task<IReadOnlyList<LedgerEntryResponse>> GetLedgerAsync(string bookingId, CancellationToken ct)
    {
        var rows = await _db.Events.AsNoTracking()
            .Where(e => e.BookingId == bookingId)
            .OrderBy(e => e.Id)
            .ToListAsync(ct);
        return rows.Select(e => new LedgerEntryResponse
        {
            Id = e.Id,
            BookingId = e.BookingId,
            OrderId = e.OrderId,
            Type = e.Type.ToString(),
            Amount = e.Amount,
            CreatedAt = e.CreatedAt.ToString("O"),
        }).ToList();
    }

    // ── Webhook ──────────────────────────────────────────────────────────────

    public sealed record WebhookOutcome(bool Ok, string Message);

    public async Task<WebhookOutcome> HandleWebhookAsync(string rawBody, IReadOnlyDictionary<string, string> headers, CancellationToken ct)
    {
        WebhookEvent ev;
        try
        {
            ev = _provider.VerifyWebhook(rawBody, headers);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Rejected webhook: signature verification failed");
            throw new PaymentDomainException("invalid signature", 400);
        }

        var orderId = ev.OrderId ?? "";
        var bookingId = ev.BookingId ?? DeriveBookingId(orderId);

        // Exactly-once: dedupe redeliveries by a stable event key.
        var eventKey = EventKey(ev, rawBody);
        if (await _db.ProcessedWebhooks.AnyAsync(p => p.EventKey == eventKey, ct))
            return new WebhookOutcome(true, "duplicate ignored");

        if (!string.IsNullOrEmpty(bookingId) && ev.Type == WebhookEventKind.PaymentCaptured && !string.IsNullOrEmpty(orderId))
        {
            var order = await _db.Orders.FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
            if (order is not null)
            {
                if (order.Kind == OrderKind.Deposit && order.DepositState is DepositState.None or DepositState.Held)
                {
                    order.DepositState = DepositState.Held;
                    order.Status = PaymentStatus.Paid;
                    order.UpdatedAt = DateTime.UtcNow;
                }
                else if (order.Kind == OrderKind.Escrow && order.Status != PaymentStatus.Paid)
                {
                    order.Status = PaymentStatus.Paid;
                    order.UpdatedAt = DateTime.UtcNow;
                    AppendEvent(bookingId, orderId, PaymentEventType.EscrowHeld, order.Amount);
                }
            }
        }

        if (!string.IsNullOrEmpty(bookingId))
            AppendEvent(bookingId, string.IsNullOrEmpty(orderId) ? null : orderId, PaymentEventType.Webhook, null, rawBody);

        _db.ProcessedWebhooks.Add(new ProcessedWebhook { EventKey = eventKey, CreatedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync(ct);
        return new WebhookOutcome(true, "ok");
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private async Task<PaymentOrder> LoadOrder(string orderId, OrderKind kind, CancellationToken ct)
    {
        var order = await _db.Orders.FirstOrDefaultAsync(o => o.OrderId == orderId, ct)
            ?? throw new PaymentDomainException($"Order '{orderId}' not found.", 404);
        if (order.Kind != kind)
            throw new PaymentDomainException($"Order '{orderId}' is not a {kind} order.");
        return order;
    }

    private async Task<Payee> LoadPayee(string agentId, CancellationToken ct) =>
        await _db.Payees.FirstOrDefaultAsync(p => p.AgentId == agentId, ct)
            ?? throw new PaymentDomainException($"Agent '{agentId}' is not registered as a payee.", 409);

    private void AppendEvent(string bookingId, string? orderId, PaymentEventType type, decimal? amount, string? raw = null)
    {
        _db.Events.Add(new PaymentEvent
        {
            BookingId = bookingId,
            OrderId = orderId,
            Type = type,
            Amount = amount,
            RawJson = raw,
            CreatedAt = DateTime.UtcNow,
        });
    }

    private OrderResponse ToResponse(PaymentOrder o, string? sessionId = null) => new()
    {
        OrderId = o.OrderId,
        BookingId = o.BookingId,
        Kind = o.Kind.ToString(),
        Amount = o.Amount,
        Currency = o.Currency,
        Status = o.Status.ToString(),
        DepositState = o.DepositState.ToString(),
        PayoutState = o.PayoutState.ToString(),
        PaymentSessionId = sessionId,
    };

    private static string DeriveBookingId(string orderId)
    {
        if (orderId.StartsWith("deposit_")) return orderId["deposit_".Length..];
        if (orderId.StartsWith("order_")) return orderId["order_".Length..];
        return orderId;
    }

    private static string EventKey(WebhookEvent ev, string rawBody)
    {
        var basis = ev.Signature ?? $"{ev.Type}:{ev.OrderId}:{rawBody}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(basis)));
    }
}
