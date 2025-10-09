import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(_db: Kysely<Database>): Promise<void> {}

export async function down(_db: Kysely<Database>): Promise<void> {}
