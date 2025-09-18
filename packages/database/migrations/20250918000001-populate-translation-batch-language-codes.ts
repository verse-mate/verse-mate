import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Starting data migration: populate existing translation batches with language codes",
  );

  // Update translate-bible parent batches with proper language codes
  console.log("Step 1: Updating translate-bible parent batches");

  const translateBibleBatches = await db
    .selectFrom("batch_jobs")
    .where("batch_type", "=", "translate-bible")
    .where("parent_batch_id", "is", null)
    .select(["id", "bible_version"])
    .execute();

  console.log(
    `Found ${translateBibleBatches.length} translate-bible parent batches to update`,
  );

  for (const batch of translateBibleBatches) {
    // Get target language from child batches
    const childBatch = await db
      .selectFrom("batch_jobs")
      .where("parent_batch_id", "=", batch.id)
      .where("batch_type", "=", "translate")
      .select("bible_version")
      .executeTakeFirst();

    if (childBatch) {
      console.log(
        `Updating parent batch ${batch.id}: source=${batch.bible_version}, target=${childBatch.bible_version}`,
      );

      await db
        .updateTable("batch_jobs")
        .set({
          source_language_code: batch.bible_version,
          target_language_code: childBatch.bible_version,
        })
        .where("id", "=", batch.id)
        .execute();
    } else {
      console.warn(`No child batches found for parent batch ${batch.id}`);
    }
  }

  // Update translate child batches with proper language codes
  console.log("Step 2: Updating translate child batches");

  const translateChildBatches = await db
    .selectFrom("batch_jobs")
    .where("batch_type", "=", "translate")
    .where("parent_batch_id", "is not", null)
    .select(["id", "bible_version", "parent_batch_id"])
    .execute();

  console.log(
    `Found ${translateChildBatches.length} translate child batches to update`,
  );

  for (const childBatch of translateChildBatches) {
    if (childBatch.parent_batch_id) {
      // Get source language from parent batch
      const parentBatch = await db
        .selectFrom("batch_jobs")
        .where("id", "=", childBatch.parent_batch_id)
        .select("bible_version")
        .executeTakeFirst();

      if (parentBatch) {
        console.log(
          `Updating child batch ${childBatch.id}: source=${parentBatch.bible_version}, target=${childBatch.bible_version}`,
        );

        await db
          .updateTable("batch_jobs")
          .set({
            source_language_code: parentBatch.bible_version,
            target_language_code: childBatch.bible_version,
          })
          .where("id", "=", childBatch.id)
          .execute();
      } else {
        console.warn(`Parent batch not found for child batch ${childBatch.id}`);
      }
    }
  }

  console.log("Data migration completed successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log(
    "Rolling back data migration: clearing language codes from translation batches",
  );

  // Clear language codes from all translation batches
  await db
    .updateTable("batch_jobs")
    .set({
      source_language_code: null,
      target_language_code: null,
    })
    .where("batch_type", "in", ["translate", "translate-bible"])
    .execute();

  console.log("Data migration rollback completed");
}
