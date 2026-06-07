// Hand-written model for the translation_jobs table (no live local DB to
// regenerate from). Mirrors the generated-model shape; keep nullability/types
// in sync with migrations/20260607000000-create-translation-jobs-table.ts.

import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type TranslationJobsJobId = string;

/** Represents the table public.translation_jobs */
export default interface TranslationJobsTable {
  job_id: ColumnType<
    TranslationJobsJobId,
    TranslationJobsJobId | undefined,
    TranslationJobsJobId
  >;

  target_language_code: ColumnType<string, string, string>;

  source_language_code: ColumnType<string, string | undefined, string>;

  // jsonb array of kind strings.
  kinds: ColumnType<unknown, unknown, unknown>;

  scope_type: ColumnType<string, string, string>;

  book_name: ColumnType<string | null, string | null, string | null>;

  // jsonb array of chapter numbers (nullable).
  chapter_numbers: ColumnType<unknown | null, unknown | null, unknown | null>;

  model: ColumnType<string, string, string>;

  config_dir: ColumnType<string | null, string | null, string | null>;

  status: ColumnType<string, string | undefined, string>;

  total_units: ColumnType<number, number | undefined, number>;

  done_units: ColumnType<number, number | undefined, number>;

  failed_units: ColumnType<number, number | undefined, number>;

  paused_until: ColumnType<
    Date | null,
    Date | string | null,
    Date | string | null
  >;

  last_error: ColumnType<string | null, string | null, string | null>;

  created_at: ColumnType<
    Date | null,
    Date | string | null,
    Date | string | null
  >;

  updated_at: ColumnType<
    Date | null,
    Date | string | null,
    Date | string | null
  >;
}

export type TranslationJobs = Selectable<TranslationJobsTable>;

export type NewTranslationJobs = Insertable<TranslationJobsTable>;

export type TranslationJobsUpdate = Updateable<TranslationJobsTable>;
