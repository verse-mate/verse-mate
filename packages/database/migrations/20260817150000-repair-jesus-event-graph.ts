import type { Kysely } from "kysely";
import type Database from "../src/models/Database";
import { projectJesusEventsFromEntries } from "../src/seeds/jesus-events.project";

/**
 * Repair the Jesus event graph on databases where it was never built.
 *
 * `20260817130000-migrate-jesus-entries-to-events` projects `jesus_entries`
 * onto the event graph, and creates `jesus_collection_events` on the way. It
 * does both *after* an early return that fires when the corpus is empty:
 *
 *     if (entries.length === 0) { ...; return; }   // ← before the CREATE TABLE
 *
 * On any database that had no corpus when it ran — every fresh environment,
 * production included, because the backend container entrypoint runs
 * `migrate-deploy` and never `db:seed` — that migration therefore records
 * itself as applied while leaving `jesus_collection_events` uncreated. It can
 * never run again, so nothing repairs it: `/jesus/collections/:slug` queries
 * that table and would fail for every Popular Study, permanently.
 *
 * This migration is the repair, and it is deliberately a separate file rather
 * than an edit to the one above — that one has already run in production, so
 * changing it would only alter what fresh databases do while leaving the
 * damaged ones damaged.
 *
 * Both halves are safe on a database that is already correct: the table is
 * created only if absent, and the projection is idempotent.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("jesus_collection_events")
    .ifNotExists()
    .addColumn("collection_id", "uuid", (col) =>
      col
        .references("jesus_collections.collection_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addPrimaryKeyConstraint("jesus_collection_events_pkey", [
      "collection_id",
      "event_id",
    ])
    .execute();

  // Build the graph for any corpus that arrived after the original migration
  // ran. On a production database that has still never been seeded this is a
  // no-op, and `db:seed` will do the projection when it is finally run.
  const result = await projectJesusEventsFromEntries(db);

  if (result.events > 0 || result.facets > 0) {
    console.log(
      `Jesus event graph repaired: ${result.events} events, ${result.facets} facets, ${result.passages} passages`,
    );
  }
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Intentionally empty. The table this creates belongs to the migration above
  // — dropping it here would take it away from databases that legitimately
  // built it there, and rolling back a repair should not re-break anything.
}
