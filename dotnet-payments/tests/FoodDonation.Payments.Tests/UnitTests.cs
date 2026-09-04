using System.Security.Cryptography;
using System.Text;
using FoodDonation.Payments.Api.Configuration;
using FoodDonation.Payments.Api.Payments;
using FoodDonation.Payments.Api.Payments.Providers;
using Microsoft.Extensions.Options;
using Xunit;

namespace FoodDonation.Payments.Tests;

public class ConfigInvariantTests
{
    [Fact]
    public void Deposit_must_be_at_least_agent_minimum()
    {
        var validator = new DepositOptionsValidator();
        Assert.True(validator.Validate(null, new DepositOptions { Amount = 200, AgentFailedTripMin = 60 }).Succeeded);
        Assert.True(validator.Validate(null, new DepositOptions { Amount = 60, AgentFailedTripMin = 60 }).Succeeded);
        Assert.True(validator.Validate(null, new DepositOptions { Amount = 50, AgentFailedTripMin = 60 }).Failed);
        Assert.True(validator.Validate(null, new DepositOptions { Amount = 0, AgentFailedTripMin = 0 }).Failed);
    }

    [Fact]
    public void Ride_share_pct_must_be_0_to_100()
    {
        var validator = new RideOptionsValidator();
        Assert.True(validator.Validate(null, new RideOptions { Fee = 80, AgentSharePct = 80 }).Succeeded);
        Assert.True(validator.Validate(null, new RideOptions { Fee = 80, AgentSharePct = 101 }).Failed);
        Assert.True(validator.Validate(null, new RideOptions { Fee = 0, AgentSharePct = 50 }).Failed);
    }
}

public class WebhookSignatureTests
{
    private static CashfreeProvider Provider(string secret) =>
        new(new HttpClient { BaseAddress = new Uri("https://sandbox.cashfree.com/pg") },
            Options.Create(new CashfreeOptions { SecretKey = secret }));

    private static string Sign(string secret, string timestamp, string body) =>
        Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(timestamp + body)));

    [Fact]
    public void Valid_signature_is_accepted_and_normalized()
    {
        const string secret = "test_secret";
        const string ts = "1725446400";
        var body = """{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"deposit_bk1","order_tags":{"bookingId":"bk1"}}}}""";
        var headers = new Dictionary<string, string>
        {
            ["x-webhook-signature"] = Sign(secret, ts, body),
            ["x-webhook-timestamp"] = ts,
        };

        var ev = Provider(secret).VerifyWebhook(body, headers);
        Assert.Equal(WebhookEventKind.PaymentCaptured, ev.Type);
        Assert.Equal("deposit_bk1", ev.OrderId);
        Assert.Equal("bk1", ev.BookingId);
    }

    [Fact]
    public void Tampered_body_is_rejected()
    {
        const string secret = "test_secret";
        const string ts = "1725446400";
        var body = """{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"deposit_bk1"}}}""";
        var headers = new Dictionary<string, string>
        {
            ["x-webhook-signature"] = Sign(secret, ts, body),
            ["x-webhook-timestamp"] = ts,
        };
        var tampered = body.Replace("deposit_bk1", "deposit_bk2");
        Assert.Throws<InvalidOperationException>(() => Provider(secret).VerifyWebhook(tampered, headers));
    }

    [Fact]
    public void Wrong_secret_is_rejected()
    {
        const string ts = "1725446400";
        var body = """{"type":"PAYMENT_SUCCESS_WEBHOOK"}""";
        var headers = new Dictionary<string, string>
        {
            ["x-webhook-signature"] = Sign("attacker_secret", ts, body),
            ["x-webhook-timestamp"] = ts,
        };
        Assert.Throws<InvalidOperationException>(() => Provider("real_secret").VerifyWebhook(body, headers));
    }
}
