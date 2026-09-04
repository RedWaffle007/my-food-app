using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FoodDonation.Payments.Api.Data;
using FoodDonation.Payments.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace FoodDonation.Payments.Api.Services;

/// <summary>
/// Replays a stored response for a repeated Idempotency-Key so a retried command
/// never moves money twice. A key reused with a different request body is a
/// client bug and is rejected.
/// </summary>
public class IdempotencyService
{
    private readonly AppDbContext _db;

    public IdempotencyService(AppDbContext db) => _db = db;

    public sealed record CachedResponse(int StatusCode, string Json);

    public enum LookupOutcome { Fresh, Replay, Conflict }

    public sealed record LookupResult(LookupOutcome Outcome, CachedResponse? Cached);

    public static string HashRequest(object? request)
    {
        var json = request is null ? "" : JsonSerializer.Serialize(request);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
    }

    public async Task<LookupResult> BeginAsync(string? key, string endpoint, string requestHash, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key))
            return new LookupResult(LookupOutcome.Fresh, null);

        var existing = await _db.IdempotencyRecords.AsNoTracking().FirstOrDefaultAsync(r => r.Key == key, ct);
        if (existing is null)
            return new LookupResult(LookupOutcome.Fresh, null);

        if (existing.Endpoint != endpoint || existing.RequestHash != requestHash)
            return new LookupResult(LookupOutcome.Conflict, null);

        return new LookupResult(LookupOutcome.Replay, new CachedResponse(existing.StatusCode, existing.ResponseJson));
    }

    public async Task StoreAsync(string? key, string endpoint, string requestHash, int statusCode, object? response, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        if (await _db.IdempotencyRecords.AnyAsync(r => r.Key == key, ct)) return;

        _db.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Key = key,
            Endpoint = endpoint,
            RequestHash = requestHash,
            StatusCode = statusCode,
            // Serialize with web defaults (camelCase) so a replayed response is
            // byte-identical to the original fresh response.
            ResponseJson = response is null ? "" : JsonSerializer.Serialize(response, JsonSerializerOptions.Web),
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync(ct);
    }
}
