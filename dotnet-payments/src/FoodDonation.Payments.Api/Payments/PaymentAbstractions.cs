using FoodDonation.Payments.Api.Domain;

namespace FoodDonation.Payments.Api.Payments;

/// <summary>Provider-agnostic money value. Nothing gateway-specific appears here.</summary>
public readonly record struct Money(decimal Amount, string Currency = "INR");

public readonly record struct PayeeRef(string ProviderPayeeId);

public record RegisterPayeeInput(string AgentId, string Name, string? Email = null, string? Phone = null);

public record EscrowOrderInput(
    string BookingId,
    Money Amount,
    int AgentSharePct,
    string DonorId,
    PayeeRef Payee,
    string? DonorEmail = null,
    string? DonorPhone = null);

public record PaymentOrderResult(string OrderId, string PaymentSessionId, PaymentStatus Status);

public record PayoutInput(string BookingId, string OrderId, PayeeRef Payee, Money Amount);
public record PayoutResult(string TransferId, PayoutState Status);

public record RefundInput(string OrderId, Money Amount, string? Reason = null);
public record RefundResult(string RefundId, PaymentStatus Status);

public record DepositHoldInput(string BookingId, Money Deposit, string DonorId, string? DonorEmail = null, string? DonorPhone = null);
public record DepositHold(string DepositId, string OrderId, string PaymentSessionId, DepositState Status);

public record DepositReleaseInput(string DepositId, string OrderId, Money Amount);
public record DepositResult(DepositState Status, string Reference);

public record DepositCaptureInput(
    string DepositId,
    string OrderId,
    Money AgentMinimum,
    Money DonorRemainder,
    PayeeRef Payee);

public record DepositCaptureResult(DepositState Status, PayoutResult AgentPayout, RefundResult DonorRefund);

public enum WebhookEventKind
{
    PaymentCaptured,
    PaymentFailed,
    PayoutSettled,
    RefundProcessed,
    Unknown,
}

public record WebhookEvent(
    WebhookEventKind Type,
    string? OrderId,
    string? BookingId,
    IReadOnlyDictionary<string, object?> Raw,
    string? Signature = null);

/// <summary>
/// The single seam every payment/payout call goes through. The application layer
/// depends on THIS interface, never on a concrete gateway. Port of the TypeScript
/// <c>PaymentProvider</c> interface used by the existing Firebase functions.
/// </summary>
public interface IPaymentProvider
{
    string Name { get; }

    Task<PayeeRef> RegisterPayeeAsync(RegisterPayeeInput input, CancellationToken ct = default);

    Task<DepositHold> HoldDepositAsync(DepositHoldInput input, CancellationToken ct = default);
    Task<DepositResult> ReleaseDepositAsync(DepositReleaseInput input, CancellationToken ct = default);
    Task<DepositCaptureResult> CaptureDepositForFailedTripAsync(DepositCaptureInput input, CancellationToken ct = default);
    Task<DepositState> GetDepositStatusAsync(string depositId, CancellationToken ct = default);

    Task<PaymentOrderResult> CreateEscrowOrderAsync(EscrowOrderInput input, CancellationToken ct = default);
    Task<PaymentStatus> GetPaymentStatusAsync(string orderId, CancellationToken ct = default);
    Task<PayoutResult> ReleasePayoutAsync(PayoutInput input, CancellationToken ct = default);
    Task<RefundResult> RefundAsync(RefundInput input, CancellationToken ct = default);

    /// <summary>Verify a gateway callback's signature and normalize it to a WebhookEvent.</summary>
    WebhookEvent VerifyWebhook(string rawBody, IReadOnlyDictionary<string, string> headers);
}
