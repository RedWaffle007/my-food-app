using System.ComponentModel.DataAnnotations;

namespace FoodDonation.Payments.Api.Domain;

/// <summary>An agent onboarded as a payee/vendor so their share can be settled.</summary>
public class Payee
{
    [MaxLength(128)]
    public required string AgentId { get; set; }

    [MaxLength(128)]
    public required string ProviderPayeeId { get; set; }

    [MaxLength(256)]
    public string? Name { get; set; }

    [MaxLength(256)]
    public string? Email { get; set; }

    [MaxLength(64)]
    public string? Phone { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// A single money order (deposit or ride escrow). This is the payment service's
/// authoritative record — the trust boundary the mobile client never writes to.
/// </summary>
public class PaymentOrder
{
    [MaxLength(128)]
    public required string OrderId { get; set; }

    [MaxLength(128)]
    public required string BookingId { get; set; }

    public OrderKind Kind { get; set; }

    public decimal Amount { get; set; }

    [MaxLength(8)]
    public string Currency { get; set; } = "INR";

    /// <summary>For escrow orders: the agent's percentage of the ride fee (held/deferred).</summary>
    public int AgentSharePct { get; set; }

    public PaymentStatus Status { get; set; } = PaymentStatus.Created;
    public PayoutState PayoutState { get; set; } = PayoutState.None;
    public DepositState DepositState { get; set; } = DepositState.None;

    [MaxLength(128)]
    public string? ProviderPayeeId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Append-only audit entry. Rows are inserted, never updated or deleted.</summary>
public class PaymentEvent
{
    public long Id { get; set; }

    [MaxLength(128)]
    public required string BookingId { get; set; }

    [MaxLength(128)]
    public string? OrderId { get; set; }

    public PaymentEventType Type { get; set; }

    public decimal? Amount { get; set; }

    /// <summary>Raw provider/webhook payload as JSON.</summary>
    public string? RawJson { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Idempotency record: keyed by the client-supplied Idempotency-Key so a retried
/// command returns the original response instead of moving money twice.
/// </summary>
public class IdempotencyRecord
{
    [MaxLength(200)]
    public required string Key { get; set; }

    [MaxLength(128)]
    public required string Endpoint { get; set; }

    /// <summary>Hash of the request body, to detect key reuse with a different payload.</summary>
    [MaxLength(128)]
    public required string RequestHash { get; set; }

    public int StatusCode { get; set; }

    public string ResponseJson { get; set; } = "";

    public DateTime CreatedAt { get; set; }
}

/// <summary>Dedupe record so a webhook redelivery is applied exactly once.</summary>
public class ProcessedWebhook
{
    [MaxLength(200)]
    public required string EventKey { get; set; }

    public DateTime CreatedAt { get; set; }
}
