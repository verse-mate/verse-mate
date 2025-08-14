import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {}

export async function down(db: Kysely<Database>): Promise<void> {}
