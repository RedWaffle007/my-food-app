using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FoodDonation.Payments.Api.Data;

/// <summary>
/// Used by <c>dotnet ef</c> at design time so migration commands don't boot the
/// whole web host. Migrations are authored against the SQLite provider (the
/// default/test provider); regenerate for Npgsql when targeting PostgreSQL.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=payments.db")
            .Options;
        return new AppDbContext(options);
    }
}
