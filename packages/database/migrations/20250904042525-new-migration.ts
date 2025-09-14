import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // This is a placeholder migration to fix the corrupted migration history
  // No actual changes are made to the database
}

export async function down(db: Kysely<any>): Promise<void> {
  // No rollback needed as no changes were made
}
