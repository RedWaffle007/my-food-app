using FoodDonation.Payments.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace FoodDonation.Payments.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Payee> Payees => Set<Payee>();
    public DbSet<PaymentOrder> Orders => Set<PaymentOrder>();
    public DbSet<PaymentEvent> Events => Set<PaymentEvent>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<ProcessedWebhook> ProcessedWebhooks => Set<ProcessedWebhook>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Payee>(e =>
        {
            e.ToTable("payees");
            e.HasKey(p => p.AgentId);
        });

        modelBuilder.Entity<PaymentOrder>(e =>
        {
            e.ToTable("payment_orders");
            e.HasKey(o => o.OrderId);
            e.Property(o => o.Kind).HasConversion<string>().HasMaxLength(16);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(o => o.PayoutState).HasConversion<string>().HasMaxLength(16);
            e.Property(o => o.DepositState).HasConversion<string>().HasMaxLength(16);
            e.Property(o => o.Amount).HasColumnType("decimal(18,2)");
            e.HasIndex(o => o.BookingId);
        });

        modelBuilder.Entity<PaymentEvent>(e =>
        {
            e.ToTable("payment_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            e.HasIndex(x => x.BookingId);
            e.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<IdempotencyRecord>(e =>
        {
            e.ToTable("idempotency_records");
            e.HasKey(x => x.Key);
        });

        modelBuilder.Entity<ProcessedWebhook>(e =>
        {
            e.ToTable("processed_webhooks");
            e.HasKey(x => x.EventKey);
        });
    }
}
