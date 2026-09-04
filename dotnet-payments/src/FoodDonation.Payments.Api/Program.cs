using FoodDonation.Payments.Api.Auth;
using FoodDonation.Payments.Api.Configuration;
using FoodDonation.Payments.Api.Contracts;
using FoodDonation.Payments.Api.Data;
using FoodDonation.Payments.Api.Payments;
using FoodDonation.Payments.Api.Payments.Providers;
using FoodDonation.Payments.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// ── Logging ──────────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.TimestampFormat = "yyyy-MM-dd HH:mm:ss ";
});

// ── Options (validated at startup; secrets come from configuration/env) ───────
builder.Services.AddOptions<DepositOptions>().Bind(builder.Configuration.GetSection(DepositOptions.Section)).ValidateOnStart();
builder.Services.AddOptions<RideOptions>().Bind(builder.Configuration.GetSection(RideOptions.Section)).ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<DepositOptions>, DepositOptionsValidator>();
builder.Services.AddSingleton<IValidateOptions<RideOptions>, RideOptionsValidator>();
builder.Services.Configure<CashfreeOptions>(builder.Configuration.GetSection(CashfreeOptions.Section));
builder.Services.Configure<ServiceAuthOptions>(builder.Configuration.GetSection(ServiceAuthOptions.Section));

// ── Database (SQLite by default, PostgreSQL opt-in) ──────────────────────────
var dbProvider = builder.Configuration.GetValue<string>("Database:Provider") ?? "Sqlite";
var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=payments.db";
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
        || dbProvider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
        options.UseNpgsql(connectionString);
    else
        options.UseSqlite(connectionString);
});

// ── Payment provider (mock for local/tests, cashfree for sandbox) ────────────
var paymentsProvider = builder.Configuration.GetValue<string>("Payments:Provider") ?? "mock";
if (paymentsProvider.Equals("cashfree", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddHttpClient<IPaymentProvider, CashfreeProvider>();
else
    builder.Services.AddSingleton<IPaymentProvider, MockPaymentProvider>();

builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<IdempotencyService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o => o.SwaggerDoc("v1", new()
{
    Title = "Food Donation — Payment & Ledger Service (.NET)",
    Version = "v1",
    Description = "ASP.NET Core payment/ledger microservice: deposit hold/release/capture, ride escrow, "
                + "payouts, refunds, an append-only ledger, idempotent commands and signed webhooks.",
}));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<PaymentExceptionHandler>();

var app = builder.Build();

// Apply migrations (SQLite) / ensure schema (Postgres demo) at startup.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsSqlite())
        db.Database.Migrate();
    else
        db.Database.EnsureCreated();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSwagger();
app.UseSwaggerUI(o => o.SwaggerEndpoint("/swagger/v1/swagger.json", "Payments API v1"));
app.UseMiddleware<ApiKeyMiddleware>();

// ── Idempotency wrapper for money-moving commands ────────────────────────────
static async Task<IResult> Idempotent(
    HttpContext http, IdempotencyService idem, string endpoint, object? request,
    Func<Task<object>> action, CancellationToken ct)
{
    var key = http.Request.Headers["Idempotency-Key"].ToString();
    var hash = IdempotencyService.HashRequest(request);
    var lookup = await idem.BeginAsync(key, endpoint, hash, ct);

    if (lookup.Outcome == IdempotencyService.LookupOutcome.Conflict)
        return Results.Problem("Idempotency-Key reused with a different request body.", statusCode: 409);
    if (lookup.Outcome == IdempotencyService.LookupOutcome.Replay)
        return Results.Content(lookup.Cached!.Json, "application/json", statusCode: lookup.Cached.StatusCode);

    var result = await action();
    await idem.StoreAsync(key, endpoint, hash, StatusCodes.Status200OK, result, ct);
    return Results.Ok(result);
}

// ── Endpoints ────────────────────────────────────────────────────────────────

app.MapGet("/api/health", async (AppDbContext db, CancellationToken ct) =>
    Results.Ok(new { status = "ok", orders = await db.Orders.CountAsync(ct), events = await db.Events.CountAsync(ct) }));

app.MapGet("/api/config", (PaymentService svc) => Results.Ok(svc.GetConfig()));

app.MapPost("/api/payees", async (RegisterPayeeRequest req, PaymentService svc, CancellationToken ct) =>
    Results.Ok(await svc.RegisterPayeeAsync(req, ct)))
    .WithSummary("Onboard an agent as a payee/vendor.");

app.MapPost("/api/deposits", (HoldDepositRequest req, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "hold-deposit", req, async () => await svc.HoldDepositAsync(req, ct), ct))
    .WithSummary("Collect the refundable deposit at booking.");

app.MapPost("/api/deposits/{bookingId}/release", (string bookingId, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "release-deposit", new { bookingId }, async () => await svc.ReleaseDepositAsync(bookingId, ct), ct))
    .WithSummary("PASS → return the whole deposit to the donor.");

app.MapPost("/api/deposits/{bookingId}/capture", (string bookingId, CaptureDepositRequest req, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "capture-deposit", new { bookingId, req.AgentId }, async () => await svc.CaptureDepositAsync(bookingId, req, ct), ct))
    .WithSummary("FAIL → pay the agent the minimum, return any remainder to the donor.");

app.MapGet("/api/orders/{orderId}", async (string orderId, PaymentService svc, CancellationToken ct) =>
    await svc.GetOrderAsync(orderId, ct) is { } o ? Results.Ok(o) : Results.NotFound());

app.MapPost("/api/orders", (CreateEscrowRequest req, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "create-escrow", req, async () => await svc.CreateEscrowOrderAsync(req, ct), ct))
    .WithSummary("Create the ride escrow order (donor pays, agent's share held).");

app.MapPost("/api/orders/{bookingId}/payout", (string bookingId, PayoutRequest req, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "release-payout", new { bookingId, req.AgentId }, async () => await svc.ReleasePayoutAsync(bookingId, req, ct), ct))
    .WithSummary("Settle the agent's held share after delivery proof.");

app.MapPost("/api/orders/{orderId}/refund", (string orderId, RefundRequest req, HttpContext http, IdempotencyService idem, PaymentService svc, CancellationToken ct) =>
    Idempotent(http, idem, "refund", new { orderId, req.Amount, req.Reason }, async () => await svc.RefundAsync(orderId, req, ct), ct))
    .WithSummary("Explicit refund (never the failed-delivery retention path).");

app.MapGet("/api/bookings/{bookingId}/ledger", async (string bookingId, PaymentService svc, CancellationToken ct) =>
    Results.Ok(await svc.GetLedgerAsync(bookingId, ct)))
    .WithSummary("Append-only payment ledger for a booking.");

app.MapPost("/api/webhooks/payments", async (HttpContext http, PaymentService svc, CancellationToken ct) =>
{
    http.Request.EnableBuffering();
    using var reader = new StreamReader(http.Request.Body);
    var raw = await reader.ReadToEndAsync(ct);
    var headers = http.Request.Headers.ToDictionary(h => h.Key.ToLowerInvariant(), h => h.Value.ToString());
    var outcome = await svc.HandleWebhookAsync(raw, headers, ct);
    return Results.Ok(new { status = outcome.Message });
})
    .WithSummary("Gateway webhook: verify signature, apply transition, append to ledger (idempotent).");

app.Run();

public partial class Program { }
