using FoodDonation.Payments.Api.Configuration;
using Microsoft.Extensions.Options;

namespace FoodDonation.Payments.Api.Auth;

/// <summary>
/// Simple service-to-service API-key gate. Firebase callable functions call this
/// service with the shared key in <c>X-Api-Key</c>. Disabled when no key is
/// configured (local dev). The webhook and health/swagger paths are exempt — the
/// webhook authenticates through its own gateway signature instead.
/// </summary>
public class ApiKeyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _apiKey;

    private static readonly string[] ExemptPrefixes =
    {
        "/api/webhooks", "/api/health", "/swagger", "/api/config",
    };

    public ApiKeyMiddleware(RequestDelegate next, IOptions<ServiceAuthOptions> options)
    {
        _next = next;
        _apiKey = options.Value.ApiKey;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "";
        if (ExemptPrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        var provided = context.Request.Headers["X-Api-Key"].ToString();
        if (!string.Equals(provided, _apiKey, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "missing or invalid X-Api-Key" });
            return;
        }

        await _next(context);
    }
}
