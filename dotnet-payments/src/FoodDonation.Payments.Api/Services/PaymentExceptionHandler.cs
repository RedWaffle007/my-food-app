using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace FoodDonation.Payments.Api.Services;

/// <summary>Maps domain/validation failures to the right 4xx status + ProblemDetails.</summary>
public class PaymentExceptionHandler : IExceptionHandler
{
    private readonly ILogger<PaymentExceptionHandler> _log;

    public PaymentExceptionHandler(ILogger<PaymentExceptionHandler> log) => _log = log;

    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken ct)
    {
        if (exception is not PaymentDomainException domain)
            return false;

        _log.LogWarning("Domain error {Status}: {Message}", domain.StatusCode, domain.Message);
        http.Response.StatusCode = domain.StatusCode;
        await http.Response.WriteAsJsonAsync(new
        {
            type = "about:blank",
            title = domain.Message,
            status = domain.StatusCode,
        }, ct);
        return true;
    }
}
