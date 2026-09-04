namespace FoodDonation.Payments.Api.Payments;

/// <summary>
/// Provider-agnostic transient-failure signal. Adapters throw this for conditions
/// worth retrying (e.g. Cashfree's Split-After-Payment gate, 5xx, rate limits).
/// Callers key their retry policy off this type, never off gateway error strings.
/// </summary>
public class PaymentRetryableError : Exception
{
    public PaymentRetryableError(string message) : base(message) { }
}
