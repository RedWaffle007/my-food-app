# Food Donation — Payment & Ledger Service (.NET 9)

A dedicated **ASP.NET Core 9** microservice that owns the money in the food-donation
app: **deposit hold / release / capture, ride escrow, agent payouts, refunds, an
append-only payment ledger, idempotent commands, and signed gateway webhooks** —
persisted with **Entity Framework Core** (SQLite for local/dev, PostgreSQL for a
containerised deployment).

Payments deserve their own trust boundary: idempotent processing, an audit
history, and durable relational transactions. The mobile client never moves
money; the Firebase Cloud Functions stay the orchestration layer and call this
service over authenticated HTTP.

## Why a separate service

```
 Expo / React Native client   (reads state, triggers flows — never moves money)
            │
            ▼
 Firebase Cloud Functions      (workflow: bookings, FIFO matching, edibility)
            │  authenticated HTTP (PAYMENTS_PROVIDER=dotnet)
            ▼
 ASP.NET Core Payment Service  ── EF Core ──▶  SQLite / PostgreSQL
   deposit · escrow · payout · refund · ledger · webhooks
            │
            ▼
 Payment gateway (Cashfree sandbox / mock)
```

The service faithfully reproduces the domain of the original TypeScript payment
module: the same order-id scheme (`deposit_<bookingId>`, `order_<bookingId>`), the
same provider abstraction (`IPaymentProvider`), the same money invariants, and
the same webhook shape.

## The domain (MVP loop)

A donor pays a **refundable deposit** at booking. An agent verifies edibility:

- **PASS** → deposit returned to the donor instantly → ride fee paid into escrow →
  on delivery proof, the agent's share is paid out.
- **FAIL** → deposit **captured**: the agent is paid a fixed failed-trip minimum,
  any remainder returns to the donor. Terminal.

Deposit money and ride money are **separate orders / separate ledger entries** —
never mixed. Hard invariant, validated at startup:
`Deposit:Amount >= Deposit:AgentFailedTripMin`.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /api/payees` | Onboard an agent as a payee/vendor |
| `POST /api/deposits` | Hold the refundable deposit at booking |
| `POST /api/deposits/{bookingId}/release` | PASS → return the deposit to the donor |
| `POST /api/deposits/{bookingId}/capture` | FAIL → pay agent minimum, refund remainder |
| `POST /api/orders` | Create the ride escrow order |
| `POST /api/orders/{bookingId}/payout` | Settle the agent's held share |
| `POST /api/orders/{orderId}/refund` | Explicit refund |
| `GET  /api/orders/{orderId}` | Read order state |
| `GET  /api/bookings/{bookingId}/ledger` | Append-only ledger for a booking |
| `POST /api/webhooks/payments` | Signed gateway webhook (verify → apply → ledger) |
| `GET  /api/config` | Effective deposit/ride money config |
| `GET  /api/health` | Liveness + counts |

Interactive docs: **Swagger UI at `/swagger`**.

## Key engineering features

- **Idempotent commands** — every money-moving `POST` honours an `Idempotency-Key`
  header; a retried request replays the original response (byte-identical) instead
  of moving money twice. Reusing a key with a different body is a `409`.
- **Signed webhooks** — Cashfree webhook signatures are verified with
  `base64(HMAC_SHA256(secret, timestamp + body))` in constant time; redeliveries
  are de-duplicated so each event is applied exactly once.
- **Append-only ledger** — `payment_events` rows are only ever inserted, giving a
  complete money audit trail per booking.
- **Provider abstraction** — `IPaymentProvider` with an in-memory `mock`
  (local/tests) and a `Cashfree` sandbox adapter. Swapping gateways touches one
  file + the factory.
- **Config-driven money** — deposit/ride amounts and the agent share come from
  configuration and are validated at startup (`IValidateOptions`).
- **Structured logging, ProblemDetails error handling, environment-based
  secrets** (never hard-coded).

## Project layout

```
dotnet-payments/
├── FoodDonation.Payments.sln
├── docker-compose.yml                 # PostgreSQL + API
├── src/FoodDonation.Payments.Api/
│   ├── Program.cs                     # Minimal API, DI, config, auth, Swagger
│   ├── Domain/                        # Entities + enums
│   ├── Data/                          # AppDbContext + EF Core migrations
│   ├── Payments/                      # IPaymentProvider, DTOs, Mock + Cashfree
│   ├── Configuration/                 # Validated money/Cashfree/auth options
│   ├── Services/                      # PaymentService, IdempotencyService
│   ├── Contracts/                     # Request/response DTOs + validation
│   ├── Auth/                          # X-Api-Key service-to-service gate
│   └── Dockerfile
└── tests/FoodDonation.Payments.Tests/ # xUnit unit + integration tests
```

## Prerequisites

- [.NET SDK 9.0](https://dotnet.microsoft.com/download)
- (Optional) `dotnet-ef` for migrations: `dotnet tool install --global dotnet-ef`
- (Optional) Docker + Compose for the PostgreSQL path

## Run locally (SQLite, mock gateway)

```bash
cd src/FoodDonation.Payments.Api
dotnet run
# API on http://localhost:5090, Swagger at http://localhost:5090/swagger
```

Migrations are applied automatically at startup for SQLite. A full walk-through:

```bash
B=http://localhost:5090
curl -X POST $B/api/payees   -H 'Content-Type: application/json' -d '{"agentId":"agent1","name":"Ravi"}'
curl -X POST $B/api/deposits -H 'Content-Type: application/json' -H 'Idempotency-Key: k1' \
     -d '{"bookingId":"bk1","donorId":"donor1"}'
curl -X POST $B/api/deposits/bk1/release -d '{}' -H 'Content-Type: application/json'   # PASS
curl -X POST $B/api/orders   -H 'Content-Type: application/json' \
     -d '{"bookingId":"bk1","donorId":"donor1","agentId":"agent1"}'
curl -X POST $B/api/orders/bk1/payout -H 'Content-Type: application/json' \
     -d '{"bookingId":"bk1","agentId":"agent1"}'
curl $B/api/bookings/bk1/ledger
```

## Run with PostgreSQL (Docker)

```bash
docker compose up --build      # API on http://localhost:5090, Postgres on 5433
```

## Migrations

```bash
cd src/FoodDonation.Payments.Api
dotnet ef migrations add <Name>       # add a migration (authored against SQLite)
dotnet ef database update             # apply
```

For PostgreSQL, regenerate migrations with the Npgsql provider selected.

## Integration with the Firebase functions

The functions already resolve a payment provider from `PAYMENTS_PROVIDER`. A new
`dotnet` adapter (`functions/src/payments/providers/dotnet.ts`) implements the
existing `PaymentProvider` interface by calling this service, so **no loop code
changes**:

```bash
# in functions/.env
PAYMENTS_PROVIDER=dotnet
DOTNET_PAYMENTS_URL=http://localhost:5090
DOTNET_PAYMENTS_API_KEY=<optional shared key matching ServiceAuth:ApiKey>
```

The gateway webhook is delivered directly to this service
(`POST /api/webhooks/payments`), which verifies the signature and updates the
ledger.

## Tests

```bash
dotnet test
```

Covers: the deposit/ride config invariants; Cashfree webhook signature
verification (valid / tampered / wrong-secret); the full PASS and FAIL money
loops; append-only ledger contents; idempotent replay and key-reuse conflict;
webhook de-duplication; and error cases (unregistered agent, illegal state
transitions).
