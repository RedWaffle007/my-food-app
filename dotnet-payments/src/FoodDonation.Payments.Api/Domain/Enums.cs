namespace FoodDonation.Payments.Api.Domain;

/// <summary>Kind of money order. Deposit money and ride/escrow money are never mixed.</summary>
public enum OrderKind
{
    Deposit,
    Escrow,
}

public enum PaymentStatus
{
    Created,
    Paid,
    Failed,
    Refunded,
}

public enum PayoutState
{
    None,
    Pending,
    Released,
    Failed,
}

public enum DepositState
{
    None,
    Held,
    Released,
    Captured,
}

/// <summary>Append-only money audit log entry types (the payment ledger).</summary>
public enum PaymentEventType
{
    OrderCreated,
    DepositHeld,
    DepositReleased,
    DepositCaptured,
    EscrowHeld,
    PayoutReleased,
    Refunded,
    Webhook,
}
