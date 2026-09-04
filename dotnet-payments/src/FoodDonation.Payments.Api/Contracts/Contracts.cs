using System.ComponentModel.DataAnnotations;

namespace FoodDonation.Payments.Api.Contracts;

// ── Requests ─────────────────────────────────────────────────────────────────

public record RegisterPayeeRequest
{
    [Required, MaxLength(128)] public string AgentId { get; init; } = "";
    [Required, MaxLength(256)] public string Name { get; init; } = "";
    [EmailAddress] public string? Email { get; init; }
    public string? Phone { get; init; }
}

public record HoldDepositRequest
{
    [Required, MaxLength(128)] public string BookingId { get; init; } = "";
    [Required, MaxLength(128)] public string DonorId { get; init; } = "";
    public string? DonorEmail { get; init; }
    public string? DonorPhone { get; init; }
}

public record CreateEscrowRequest
{
    [Required, MaxLength(128)] public string BookingId { get; init; } = "";
    [Required, MaxLength(128)] public string DonorId { get; init; } = "";
    [Required, MaxLength(128)] public string AgentId { get; init; } = "";
    public string? DonorEmail { get; init; }
    public string? DonorPhone { get; init; }
}

public record CaptureDepositRequest
{
    [Required, MaxLength(128)] public string AgentId { get; init; } = "";
}

public record PayoutRequest
{
    [Required, MaxLength(128)] public string BookingId { get; init; } = "";
    [Required, MaxLength(128)] public string AgentId { get; init; } = "";
}

public record RefundRequest
{
    [Range(0.01, double.MaxValue)] public decimal Amount { get; init; }
    public string? Reason { get; init; }
}

// ── Responses ────────────────────────────────────────────────────────────────

public record OrderResponse
{
    public required string OrderId { get; init; }
    public required string BookingId { get; init; }
    public required string Kind { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "INR";
    public required string Status { get; init; }
    public required string DepositState { get; init; }
    public required string PayoutState { get; init; }
    public string? PaymentSessionId { get; init; }
}

public record LedgerEntryResponse
{
    public long Id { get; init; }
    public required string BookingId { get; init; }
    public string? OrderId { get; init; }
    public required string Type { get; init; }
    public decimal? Amount { get; init; }
    public required string CreatedAt { get; init; }
}

public record ConfigResponse
{
    public decimal DepositAmount { get; init; }
    public decimal AgentFailedTripMin { get; init; }
    public decimal RideFee { get; init; }
    public int AgentRideSharePct { get; init; }
}
