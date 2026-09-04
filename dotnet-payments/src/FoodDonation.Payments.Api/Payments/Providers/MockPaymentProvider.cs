using System.Collections.Concurrent;
using System.Text.Json;
using FoodDonation.Payments.Api.Domain;

namespace FoodDonation.Payments.Api.Payments.Providers;

/// <summary>
/// Deterministic in-memory gateway simulation for the emulator, local demo and
/// tests. No network. Mirrors the retention semantics of the original mock: an
/// order that never has ReleasePayout called keeps its held share on the platform.
/// </summary>
public class MockPaymentProvider : IPaymentProvider
{
    public string Name => "mock";

    private readonly ConcurrentDictionary<string, PaymentStatus> _orderStatus = new();
    private readonly ConcurrentDictionary<string, DepositState> _deposits = new();
    private int _seq;

    private string NextId(string prefix) => $"{prefix}_{Interlocked.Increment(ref _seq)}";

    public Task<PayeeRef> RegisterPayeeAsync(RegisterPayeeInput input, CancellationToken ct = default) =>
        Task.FromResult(new PayeeRef($"vendor_{input.AgentId}"));

    public Task<DepositHold> HoldDepositAsync(DepositHoldInput input, CancellationToken ct = default)
    {
        var orderId = $"deposit_{input.BookingId}";
        _deposits[orderId] = DepositState.Held;
        return Task.FromResult(new DepositHold(orderId, orderId, NextId("session"), DepositState.Held));
    }

    public Task<DepositResult> ReleaseDepositAsync(DepositReleaseInput input, CancellationToken ct = default)
    {
        // PASS → full deposit back to donor; the agent gets nothing from it.
        _deposits[input.OrderId] = DepositState.Released;
        return Task.FromResult(new DepositResult(DepositState.Released, NextId("release")));
    }

    public Task<DepositCaptureResult> CaptureDepositForFailedTripAsync(DepositCaptureInput input, CancellationToken ct = default)
    {
        // FAIL → agent paid the minimum, remainder (if any) back to the donor.
        _deposits[input.OrderId] = DepositState.Captured;
        return Task.FromResult(new DepositCaptureResult(
            DepositState.Captured,
            new PayoutResult(NextId("transfer"), PayoutState.Released),
            new RefundResult(NextId("refund"), PaymentStatus.Refunded)));
    }

    public Task<DepositState> GetDepositStatusAsync(string depositId, CancellationToken ct = default) =>
        Task.FromResult(_deposits.GetValueOrDefault(depositId, DepositState.None));

    public Task<PaymentOrderResult> CreateEscrowOrderAsync(EscrowOrderInput input, CancellationToken ct = default)
    {
        var orderId = $"order_{input.BookingId}";
        _orderStatus[orderId] = PaymentStatus.Created;
        return Task.FromResult(new PaymentOrderResult(orderId, NextId("session"), PaymentStatus.Created));
    }

    public Task<PaymentStatus> GetPaymentStatusAsync(string orderId, CancellationToken ct = default) =>
        Task.FromResult(_orderStatus.GetValueOrDefault(orderId, PaymentStatus.Failed));

    public Task<PayoutResult> ReleasePayoutAsync(PayoutInput input, CancellationToken ct = default) =>
        // A called release always succeeds; retention is modeled by callers never CALLING this.
        Task.FromResult(new PayoutResult(NextId("transfer"), PayoutState.Released));

    public Task<RefundResult> RefundAsync(RefundInput input, CancellationToken ct = default)
    {
        _orderStatus[input.OrderId] = PaymentStatus.Refunded;
        return Task.FromResult(new RefundResult(NextId("refund"), PaymentStatus.Refunded));
    }

    public WebhookEvent VerifyWebhook(string rawBody, IReadOnlyDictionary<string, string> headers)
    {
        // Tests/emulator pass a JSON body of our own WebhookEvent shape; echo it back.
        using var doc = JsonDocument.Parse(rawBody);
        var root = doc.RootElement;
        var type = root.TryGetProperty("type", out var t) ? ParseType(t.GetString()) : WebhookEventKind.Unknown;
        var orderId = root.TryGetProperty("orderId", out var o) ? o.GetString() : null;
        var bookingId = root.TryGetProperty("bookingId", out var b) ? b.GetString() : null;
        return new WebhookEvent(type, orderId, bookingId, new Dictionary<string, object?>(), Signature: rawBody);
    }

    /// <summary>Test helper — simulate the donor completing payment on an order.</summary>
    public void MarkPaid(string orderId) => _orderStatus[orderId] = PaymentStatus.Paid;

    private static WebhookEventKind ParseType(string? type) => type switch
    {
        "payment.captured" => WebhookEventKind.PaymentCaptured,
        "payment.failed" => WebhookEventKind.PaymentFailed,
        "payout.settled" => WebhookEventKind.PayoutSettled,
        "refund.processed" => WebhookEventKind.RefundProcessed,
        _ => WebhookEventKind.Unknown,
    };
}
