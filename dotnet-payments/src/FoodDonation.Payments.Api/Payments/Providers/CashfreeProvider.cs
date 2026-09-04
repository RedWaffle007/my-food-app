using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FoodDonation.Payments.Api.Configuration;
using FoodDonation.Payments.Api.Domain;
using Microsoft.Extensions.Options;

namespace FoodDonation.Payments.Api.Payments.Providers;

/// <summary>
/// Cashfree adapter (sandbox). Gateway field names, split objects and signatures
/// live only here. Port of the TypeScript <c>CashfreeProvider</c>. The webhook
/// signature verification is fully implemented and unit-tested; the money-moving
/// HTTP calls target the documented sandbox endpoints and require sandbox
/// credentials to exercise end to end.
/// </summary>
public class CashfreeProvider : IPaymentProvider
{
    public string Name => "cashfree";

    private readonly HttpClient _http;
    private readonly CashfreeOptions _config;

    public CashfreeProvider(HttpClient http, IOptions<CashfreeOptions> config)
    {
        _config = config.Value;
        _http = http;
        _http.BaseAddress ??= new Uri(_config.BaseUrl);
        _http.DefaultRequestHeaders.TryAddWithoutValidation("x-client-id", _config.AppId);
        _http.DefaultRequestHeaders.TryAddWithoutValidation("x-client-secret", _config.SecretKey);
        _http.DefaultRequestHeaders.TryAddWithoutValidation("x-api-version", _config.ApiVersion);
    }

    public async Task<PayeeRef> RegisterPayeeAsync(RegisterPayeeInput input, CancellationToken ct = default)
    {
        var body = new
        {
            vendor_id = input.AgentId,
            name = input.Name,
            email = input.Email,
            phone = input.Phone,
        };
        var json = await RequestAsync("POST", "/easy-split/vendors", body, ct);
        return new PayeeRef(json.GetProperty("vendor_id").GetString() ?? input.AgentId);
    }

    public async Task<DepositHold> HoldDepositAsync(DepositHoldInput input, CancellationToken ct = default)
    {
        var orderId = $"deposit_{input.BookingId}";
        var sessionId = await CreateOrderAsync(orderId, input.Deposit.Amount, input.DonorId, input.DonorEmail, input.DonorPhone,
            new Dictionary<string, string> { ["bookingId"] = input.BookingId, ["kind"] = "deposit" }, ct);
        return new DepositHold(orderId, orderId, sessionId, DepositState.Held);
    }

    public async Task<DepositResult> ReleaseDepositAsync(DepositReleaseInput input, CancellationToken ct = default)
    {
        // PASS → refund the whole deposit to the donor (UPI: standard-speed refund).
        var refund = await RefundOrderAsync(input.OrderId, input.Amount.Amount, "deposit_release", ct);
        return new DepositResult(DepositState.Released, refund.RefundId);
    }

    public async Task<DepositCaptureResult> CaptureDepositForFailedTripAsync(DepositCaptureInput input, CancellationToken ct = default)
    {
        // FAIL → split the agent minimum to the agent, refund any remainder to the donor.
        var payout = await SplitAsync(input.OrderId, input.Payee.ProviderPayeeId, input.AgentMinimum.Amount, ct);
        var refund = input.DonorRemainder.Amount > 0
            ? await RefundOrderAsync(input.OrderId, input.DonorRemainder.Amount, "deposit_remainder", ct)
            : new RefundResult("noop", PaymentStatus.Refunded);
        return new DepositCaptureResult(DepositState.Captured, payout, refund);
    }

    public Task<DepositState> GetDepositStatusAsync(string depositId, CancellationToken ct = default) =>
        MapDepositStatusAsync(depositId, ct);

    public async Task<PaymentOrderResult> CreateEscrowOrderAsync(EscrowOrderInput input, CancellationToken ct = default)
    {
        var orderId = $"order_{input.BookingId}";
        var sessionId = await CreateOrderAsync(orderId, input.Amount.Amount, input.DonorId, input.DonorEmail, input.DonorPhone,
            new Dictionary<string, string>
            {
                ["bookingId"] = input.BookingId,
                ["kind"] = "escrow",
                ["agentSharePct"] = input.AgentSharePct.ToString(),
                ["vendorId"] = input.Payee.ProviderPayeeId,
            }, ct);
        return new PaymentOrderResult(orderId, sessionId, PaymentStatus.Created);
    }

    public async Task<PaymentStatus> GetPaymentStatusAsync(string orderId, CancellationToken ct = default)
    {
        var json = await RequestAsync("GET", $"/orders/{orderId}", null, ct);
        return MapOrderStatus(json.TryGetProperty("order_status", out var s) ? s.GetString() : null);
    }

    public async Task<PayoutResult> ReleasePayoutAsync(PayoutInput input, CancellationToken ct = default) =>
        await SplitAsync(input.OrderId, input.Payee.ProviderPayeeId, input.Amount.Amount, ct);

    public async Task<RefundResult> RefundAsync(RefundInput input, CancellationToken ct = default) =>
        await RefundOrderAsync(input.OrderId, input.Amount.Amount, input.Reason ?? "refund", ct);

    public WebhookEvent VerifyWebhook(string rawBody, IReadOnlyDictionary<string, string> headers)
    {
        // Cashfree PG webhook signature: base64(HMAC_SHA256(secret, timestamp + rawBody)).
        var signature = headers.GetValueOrDefault("x-webhook-signature", "");
        var timestamp = headers.GetValueOrDefault("x-webhook-timestamp", "");

        var expected = Convert.ToBase64String(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(_config.SecretKey), Encoding.UTF8.GetBytes(timestamp + rawBody)));

        var a = Encoding.UTF8.GetBytes(signature);
        var b = Encoding.UTF8.GetBytes(expected);
        if (a.Length != b.Length || !CryptographicOperations.FixedTimeEquals(a, b))
            throw new InvalidOperationException("Cashfree webhook signature verification failed");

        using var doc = JsonDocument.Parse(rawBody);
        var root = doc.RootElement;
        var type = root.TryGetProperty("type", out var t) ? MapWebhookType(t.GetString()) : WebhookEventKind.Unknown;
        string? orderId = null, bookingId = null;
        if (root.TryGetProperty("data", out var data) && data.TryGetProperty("order", out var order))
        {
            if (order.TryGetProperty("order_id", out var oid)) orderId = oid.GetString();
            if (order.TryGetProperty("order_tags", out var tags) && tags.TryGetProperty("bookingId", out var bid))
                bookingId = bid.GetString();
        }
        return new WebhookEvent(type, orderId, bookingId, new Dictionary<string, object?>(), signature);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private async Task<string> CreateOrderAsync(string orderId, decimal amount, string donorId, string? email, string? phone,
        Dictionary<string, string> tags, CancellationToken ct)
    {
        var body = new
        {
            order_id = orderId,
            order_amount = amount,
            order_currency = "INR",
            customer_details = new { customer_id = donorId, customer_email = email, customer_phone = phone },
            order_tags = tags,
        };
        var json = await RequestAsync("POST", "/orders", body, ct);
        return json.GetProperty("payment_session_id").GetString()
            ?? throw new PaymentRetryableError("Cashfree returned no payment_session_id");
    }

    private async Task<RefundResult> RefundOrderAsync(string orderId, decimal amount, string reason, CancellationToken ct)
    {
        var body = new { refund_amount = amount, refund_id = $"rf_{orderId}_{reason}", refund_note = reason };
        var json = await RequestAsync("POST", $"/orders/{orderId}/refunds", body, ct);
        return new RefundResult(json.TryGetProperty("refund_id", out var r) ? r.GetString() ?? "" : "", PaymentStatus.Refunded);
    }

    private async Task<PayoutResult> SplitAsync(string orderId, string vendorId, decimal amount, CancellationToken ct)
    {
        // Split After Payment. Cashfree gates this for ~2 minutes post-capture; that
        // window surfaces as a retryable error so callers can back off and retry.
        var body = new { split = new[] { new { vendor_id = vendorId, amount } } };
        var json = await RequestAsync("POST", $"/easy-split/orders/{orderId}/split", body, ct);
        return new PayoutResult(json.TryGetProperty("split_id", out var s) ? s.GetString() ?? "" : orderId, PayoutState.Released);
    }

    private async Task<DepositState> MapDepositStatusAsync(string depositId, CancellationToken ct)
    {
        var status = await GetPaymentStatusAsync(depositId, ct);
        return status switch
        {
            PaymentStatus.Paid => DepositState.Held,
            PaymentStatus.Refunded => DepositState.Released,
            _ => DepositState.None,
        };
    }

    private async Task<JsonElement> RequestAsync(string method, string path, object? body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(new HttpMethod(method), path);
        if (body is not null)
            req.Content = JsonContent.Create(body);

        HttpResponseMessage resp;
        try
        {
            resp = await _http.SendAsync(req, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new PaymentRetryableError($"Cashfree request failed: {ex.Message}");
        }

        var text = await resp.Content.ReadAsStringAsync(ct);
        if ((int)resp.StatusCode >= 500 || resp.StatusCode == HttpStatusCode.TooManyRequests)
            throw new PaymentRetryableError($"Cashfree {(int)resp.StatusCode}: {text}");
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Cashfree {(int)resp.StatusCode}: {text}");

        return string.IsNullOrWhiteSpace(text)
            ? default
            : JsonDocument.Parse(text).RootElement.Clone();
    }

    private static PaymentStatus MapOrderStatus(string? status) => status switch
    {
        "PAID" => PaymentStatus.Paid,
        "REFUNDED" => PaymentStatus.Refunded,
        "ACTIVE" => PaymentStatus.Created,
        _ => PaymentStatus.Failed,
    };

    private static WebhookEventKind MapWebhookType(string? type) => type switch
    {
        "PAYMENT_SUCCESS_WEBHOOK" => WebhookEventKind.PaymentCaptured,
        "PAYMENT_FAILED_WEBHOOK" => WebhookEventKind.PaymentFailed,
        "TRANSFER_SUCCESS" or "SPLIT_SETTLEMENT" => WebhookEventKind.PayoutSettled,
        "REFUND_STATUS_WEBHOOK" => WebhookEventKind.RefundProcessed,
        _ => WebhookEventKind.Unknown,
    };
}
