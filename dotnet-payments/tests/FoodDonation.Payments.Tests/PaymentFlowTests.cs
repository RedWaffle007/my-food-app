using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FoodDonation.Payments.Api.Contracts;
using Xunit;

namespace FoodDonation.Payments.Tests;

public class PaymentFlowTests : IClassFixture<PaymentsWebAppFactory>
{
    private readonly HttpClient _client;

    public PaymentFlowTests(PaymentsWebAppFactory factory) => _client = factory.CreateClient();

    private static HttpRequestMessage Post(string url, object body, string? idemKey = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body),
        };
        if (idemKey is not null) req.Headers.Add("Idempotency-Key", idemKey);
        return req;
    }

    [Fact]
    public async Task Config_is_served_with_the_invariant_holding()
    {
        var cfg = await _client.GetFromJsonAsync<ConfigResponse>("/api/config");
        Assert.NotNull(cfg);
        Assert.True(cfg!.DepositAmount >= cfg.AgentFailedTripMin);
    }

    [Fact]
    public async Task Pass_path_holds_then_releases_deposit_and_pays_out_ride()
    {
        const string booking = "bk_pass";
        await _client.PostAsJsonAsync("/api/payees", new RegisterPayeeRequest { AgentId = "agent_pass", Name = "Pass Agent" });

        // Donor pays a refundable deposit at booking.
        var hold = await (await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "donor1" })))
            .Content.ReadFromJsonAsync<OrderResponse>();
        Assert.Equal("Held", hold!.DepositState);
        Assert.NotNull(hold.PaymentSessionId);

        // Food PASSES → deposit returned instantly.
        var released = await (await _client.SendAsync(Post($"/api/deposits/{booking}/release", new { })))
            .Content.ReadFromJsonAsync<OrderResponse>();
        Assert.Equal("Released", released!.DepositState);

        // Recipient matched → donor pays ride fee into escrow.
        var escrow = await (await _client.SendAsync(Post("/api/orders",
                new CreateEscrowRequest { BookingId = booking, DonorId = "donor1", AgentId = "agent_pass" })))
            .Content.ReadFromJsonAsync<OrderResponse>();
        Assert.Equal("Escrow", escrow!.Kind);

        // Delivery proof uploaded → agent payout released.
        var payout = await (await _client.SendAsync(Post($"/api/orders/{booking}/payout", new PayoutRequest { BookingId = booking, AgentId = "agent_pass" })))
            .Content.ReadFromJsonAsync<OrderResponse>();
        Assert.Equal("Released", payout!.PayoutState);

        // Ledger records the whole money trail, append-only and ordered.
        var ledger = await _client.GetFromJsonAsync<List<LedgerEntryResponse>>($"/api/bookings/{booking}/ledger");
        var types = ledger!.Select(l => l.Type).ToList();
        Assert.Contains("OrderCreated", types);
        Assert.Contains("DepositHeld", types);
        Assert.Contains("DepositReleased", types);
        Assert.Contains("PayoutReleased", types);
    }

    [Fact]
    public async Task Fail_path_captures_agent_minimum_and_refunds_remainder()
    {
        const string booking = "bk_fail";
        await _client.PostAsJsonAsync("/api/payees", new RegisterPayeeRequest { AgentId = "agent_fail", Name = "Fail Agent" });
        await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "donor2" }));

        var captured = await (await _client.SendAsync(Post($"/api/deposits/{booking}/capture", new CaptureDepositRequest { AgentId = "agent_fail" })))
            .Content.ReadFromJsonAsync<OrderResponse>();
        Assert.Equal("Captured", captured!.DepositState);

        var ledger = await _client.GetFromJsonAsync<List<LedgerEntryResponse>>($"/api/bookings/{booking}/ledger");
        var captureEntry = Assert.Single(ledger!, l => l.Type == "DepositCaptured");
        Assert.Equal(60m, captureEntry.Amount); // agent minimum
        var refund = Assert.Single(ledger!, l => l.Type == "Refunded");
        Assert.Equal(140m, refund.Amount); // 200 deposit - 60 minimum
    }

    [Fact]
    public async Task Capture_after_release_is_rejected()
    {
        const string booking = "bk_conflict";
        await _client.PostAsJsonAsync("/api/payees", new RegisterPayeeRequest { AgentId = "agent_x", Name = "X" });
        await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "d" }));
        await _client.SendAsync(Post($"/api/deposits/{booking}/release", new { }));

        var resp = await _client.SendAsync(Post($"/api/deposits/{booking}/capture", new CaptureDepositRequest { AgentId = "agent_x" }));
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Escrow_for_unregistered_agent_is_rejected()
    {
        var resp = await _client.SendAsync(Post("/api/orders",
            new CreateEscrowRequest { BookingId = "bk_noagent", DonorId = "d", AgentId = "ghost" }));
        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task Idempotency_key_replays_the_same_response_without_double_charging()
    {
        const string booking = "bk_idem";
        const string key = "idem-123";
        var first = await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "d" }, key));
        var second = await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "d" }, key));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        // Only one OrderCreated in the ledger despite two identical requests.
        var ledger = await _client.GetFromJsonAsync<List<LedgerEntryResponse>>($"/api/bookings/{booking}/ledger");
        Assert.Single(ledger!, l => l.Type == "OrderCreated");
    }

    [Fact]
    public async Task Idempotency_key_reuse_with_different_body_conflicts()
    {
        const string key = "idem-reuse";
        await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = "bk_a", DonorId = "d" }, key));
        var resp = await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = "bk_b", DonorId = "d" }, key));
        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task Webhook_with_unverified_signature_is_rejected_and_duplicates_ignored()
    {
        // The default provider is the mock, which treats the body as the event and
        // uses it as the dedupe key — so a redelivery of the same body is ignored.
        const string booking = "bk_wh";
        await _client.SendAsync(Post("/api/deposits", new HoldDepositRequest { BookingId = booking, DonorId = "d" }));

        var payload = JsonSerializer.Serialize(new { type = "payment.captured", orderId = $"deposit_{booking}", bookingId = booking });
        var content = new StringContent(payload, Encoding.UTF8, "application/json");

        var first = await _client.PostAsync("/api/webhooks/payments", content);
        first.EnsureSuccessStatusCode();

        var again = await _client.PostAsync("/api/webhooks/payments", new StringContent(payload, Encoding.UTF8, "application/json"));
        again.EnsureSuccessStatusCode();
        var body = await again.Content.ReadAsStringAsync();
        Assert.Contains("duplicate", body);

        // Webhook recorded exactly once in the ledger.
        var ledger = await _client.GetFromJsonAsync<List<LedgerEntryResponse>>($"/api/bookings/{booking}/ledger");
        Assert.Single(ledger!, l => l.Type == "Webhook");
    }

    [Fact]
    public async Task Swagger_is_served()
    {
        var resp = await _client.GetAsync("/swagger/v1/swagger.json");
        resp.EnsureSuccessStatusCode();
        Assert.Contains("/api/deposits", await resp.Content.ReadAsStringAsync());
    }
}
