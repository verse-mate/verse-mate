import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // First, drop the existing foreign key constraint
  await db.schema
    .alterTable("explanations")
    .dropConstraint("explanations_parent_explanation_id_fkey")
    .execute();

  // Now, add the foreign key constraint back with ON DELETE SET NULL
  await db.schema
    .alterTable("explanations")
    .addForeignKeyConstraint(
      "explanations_parent_explanation_id_fkey",
      ["parent_explanation_id"],
      "explanations",
      ["explanation_id"],
    )
    .onDelete("set null")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Revert the changes: drop the modified constraint
  await db.schema
    .alterTable("explanations")
    .dropConstraint("explanations_parent_explanation_id_fkey")
    .execute();

  // Add the original constraint back (without ON DELETE SET NULL)
  await db.schema
    .alterTable("explanations")
    .addForeignKeyConstraint(
      "explanations_parent_explanation_id_fkey",
      ["parent_explanation_id"],
      "explanations",
      ["explanation_id"],
    )
    .execute();
}
