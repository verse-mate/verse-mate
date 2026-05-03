import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * Drop the refresh_tokens table.
 *
 * Per spec feat-auth-platform br-auth-001 (Phase 1 decision D-005): refresh
 * tokens are eliminated. The access token IS the persistent session token.
 * Backend Redis cache validates every access token, so server-side logout
 * (or logout-all) revokes immediately regardless of JWT expiry.
 *
 * Companion changes (in feat-eliminate-refresh-tokens branch):
 * - shared.plugin.ts: bump JWT exp from "15m" to "90d"
 * - auth.service.ts: drop refresh() method, drop refresh_token issuance
 * - auth.plugin.ts: drop /auth/refresh endpoint
 * - rate-limit.middleware.ts: drop refresh limiter
 * - refresh-token.repository.ts: delete file
 * - auth.refresh.test.ts: delete file
 * - mobile lib/auth/token-storage.ts: drop refresh-token storage
 * - mobile contexts/AuthContext.tsx: drop refreshTokens() method
 *
 * NOTE: do NOT deploy this migration to production until the backend code
 * stops trying to insert/query refresh_tokens. Otherwise inserts fail with
 * relation-not-found errors. Stage migrations work fine for testing.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Dropping refresh_tokens table (D-005)...");
  await db.schema.dropTable("refresh_tokens").ifExists().execute();
  console.log("Dropped refresh_tokens table.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting: recreating refresh_tokens table (debug only)...");

  // Recreates approximate shape; original migration carried more constraints.
  await db.schema
    .createTable("refresh_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(db.fn("gen_random_uuid")),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("token", "text", (col) => col.notNull())
    .addColumn("user_agent", "text")
    .addColumn("ip_address", "text")
    .addColumn("expires_at", "timestamp", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .addColumn("last_used_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .execute();

  console.log("Reverted refresh_tokens table.");
}
