using Microsoft.Extensions.Options;

namespace FoodDonation.Payments.Api.Configuration;

/// <summary>
/// Tunable deposit money config. Read from configuration/env — never hardcoded.
/// Hard invariant enforced at startup: Deposit &gt;= AgentFailedTripMin, so a failed
/// trip can always pay the agent's minimum out of the deposit.
/// </summary>
public class DepositOptions
{
    public const string Section = "Deposit";

    /// <summary>Refundable deposit collected from the donor at booking (INR).</summary>
    public decimal Amount { get; set; } = 200m;

    /// <summary>Fixed compensation paid to the agent from the deposit on a failed trip (INR).</summary>
    public decimal AgentFailedTripMin { get; set; } = 60m;
}

public class DepositOptionsValidator : IValidateOptions<DepositOptions>
{
    public ValidateOptionsResult Validate(string? name, DepositOptions o)
    {
        if (o.Amount <= 0)
            return ValidateOptionsResult.Fail("Deposit:Amount must be greater than 0.");
        if (o.AgentFailedTripMin < 0)
            return ValidateOptionsResult.Fail("Deposit:AgentFailedTripMin must be non-negative.");
        if (o.Amount < o.AgentFailedTripMin)
            return ValidateOptionsResult.Fail(
                $"Deposit:Amount ({o.Amount}) must be >= Deposit:AgentFailedTripMin ({o.AgentFailedTripMin}).");
        return ValidateOptionsResult.Success;
    }
}

/// <summary>Ride/escrow money config.</summary>
public class RideOptions
{
    public const string Section = "Ride";

    /// <summary>Flat ride fee the donor pays into escrow after a match (INR).</summary>
    public decimal Fee { get; set; } = 80m;

    /// <summary>Agent's percentage of the ride fee; the platform keeps the rest.</summary>
    public int AgentSharePct { get; set; } = 80;
}

public class RideOptionsValidator : IValidateOptions<RideOptions>
{
    public ValidateOptionsResult Validate(string? name, RideOptions o)
    {
        if (o.Fee <= 0)
            return ValidateOptionsResult.Fail("Ride:Fee must be greater than 0.");
        if (o.AgentSharePct is < 0 or > 100)
            return ValidateOptionsResult.Fail("Ride:AgentSharePct must be between 0 and 100.");
        return ValidateOptionsResult.Success;
    }
}

/// <summary>Cashfree adapter settings (sandbox). Secrets come from configuration/env.</summary>
public class CashfreeOptions
{
    public const string Section = "Cashfree";

    public string AppId { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public string BaseUrl { get; set; } = "https://sandbox.cashfree.com/pg";
    public string ApiVersion { get; set; } = "2023-08-01";
}

/// <summary>Service-to-service auth. Firebase functions call this API with this key.</summary>
public class ServiceAuthOptions
{
    public const string Section = "ServiceAuth";

    /// <summary>Shared API key. When empty, API-key auth is disabled (local dev).</summary>
    public string ApiKey { get; set; } = "";
}
