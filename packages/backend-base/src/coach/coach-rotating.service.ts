import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";

export interface RotatingClass {
  id: number;
  name: string;
  groupEmail: string;
  titleMatch: string[];
  leaders: string[];
}

export interface RotatingClassView {
  id: number;
  name: string;
  groupEmail: string;
  titleMatch: string[];
  leaders: Array<{ id: string; name: string; rotatingOnly: boolean }>;
}

export type RotatingRefusal =
  | "unknown-class"
  | "unknown-leader"
  | "no-leaders"
  | "address-in-use";

export async function loadRotatingClasses(
  database: db,
): Promise<RotatingClass[]> {
  const conn = database.getOrCreateConnection();
  const classes = await conn
    .selectFrom("coach_rotating_classes")
    .select(["id", "name", "group_email", "title_match"])
    .orderBy("id")
    .execute();
  const members = await conn
    .selectFrom("coach_rotating_class_leaders")
    .select(["class_id", "leader_slug"])
    .orderBy("leader_slug")
    .execute();
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    groupEmail: c.group_email,
    titleMatch: c.title_match ?? [],
    leaders: members
      .filter((m) => m.class_id === c.id)
      .map((m) => m.leader_slug),
  }));
}

export async function listRotatingClasses(
  database: db,
): Promise<RotatingClassView[]> {
  const classes = await loadRotatingClasses(database);
  const slugs = [...new Set(classes.flatMap((c) => c.leaders))];
  const leaders =
    slugs.length === 0
      ? []
      : await database
          .getOrCreateConnection()
          .selectFrom("coach_leaders")
          .select(["slug", "name", "rotating_only"])
          .where("slug", "in", slugs)
          .execute();
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    groupEmail: c.groupEmail,
    titleMatch: c.titleMatch,
    leaders: c.leaders.map((slug) => {
      const leader = leaders.find((l) => l.slug === slug);
      return {
        id: slug,
        name: leader?.name ?? slug,
        rotatingOnly: leader?.rotating_only ?? false,
      };
    }),
  }));
}

export async function isGroupAddress(
  database: Pick<db, "getOrCreateConnection">,
  email: string,
): Promise<boolean> {
  const found = await database
    .getOrCreateConnection()
    .selectFrom("coach_rotating_classes")
    .select("id")
    .where("group_email", "=", email.trim().toLowerCase())
    .executeTakeFirst();
  return found !== undefined;
}

export async function saveRotatingClass(
  database: db,
  input: {
    name: string;
    groupEmail: string;
    titleMatch: string[];
    leaders: string[];
  },
  id?: number,
): Promise<{ ok: true; id: number } | { ok: false; refusal: RotatingRefusal }> {
  const groupEmail = input.groupEmail.trim().toLowerCase();
  const titleMatch = [
    ...new Set(
      input.titleMatch
        .map((k) => k.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean),
    ),
  ];
  const leaders = [...new Set(input.leaders.map((l) => l.trim()))].filter(
    Boolean,
  );
  if (leaders.length === 0) return { ok: false, refusal: "no-leaders" };
  return database
    .getOrCreateConnection()
    .transaction()
    .execute(async (trx) => {
      const known = await trx
        .selectFrom("coach_leaders")
        .select("slug")
        .where("slug", "in", leaders)
        .execute();
      if (known.length !== leaders.length)
        return { ok: false as const, refusal: "unknown-leader" as const };
      const owner = await trx
        .selectFrom("coach_leaders")
        .select("slug")
        .where(
          sql<boolean>`lower(email) = ${groupEmail}
            OR EXISTS (SELECT 1 FROM unnest(alt_emails) a WHERE lower(a) = ${groupEmail})
            OR EXISTS (
              SELECT 1 FROM coach_leader_email_requests r
              WHERE lower(r.new_email) = ${groupEmail}
                AND r.status = 'pending' AND r.expires_at > now()
            )`,
        )
        .executeTakeFirst();
      const sharing = await trx
        .selectFrom("coach_rotating_classes")
        .select("id")
        .where("group_email", "=", groupEmail)
        .$if(id !== undefined, (q) => q.where("id", "!=", id as number))
        .executeTakeFirst();
      if (owner || sharing)
        return { ok: false as const, refusal: "address-in-use" as const };
      const values = {
        name: input.name.trim(),
        group_email: groupEmail,
        title_match: sql<string[]>`${sql.val(titleMatch)}::text[]`,
      };
      const saved =
        id === undefined
          ? await trx
              .insertInto("coach_rotating_classes")
              .values(values)
              .returning("id")
              .executeTakeFirst()
          : await trx
              .updateTable("coach_rotating_classes")
              .set(values)
              .where("id", "=", id)
              .returning("id")
              .executeTakeFirst();
      if (!saved)
        return { ok: false as const, refusal: "unknown-class" as const };
      await trx
        .deleteFrom("coach_rotating_class_leaders")
        .where("class_id", "=", saved.id)
        .execute();
      await trx
        .insertInto("coach_rotating_class_leaders")
        .values(
          leaders.map((slug) => ({ class_id: saved.id, leader_slug: slug })),
        )
        .execute();
      return { ok: true as const, id: saved.id };
    });
}

export async function setRotatingOnly(
  database: db,
  slug: string,
  rotatingOnly: boolean,
): Promise<boolean> {
  const updated = await database
    .getOrCreateConnection()
    .updateTable("coach_leaders")
    .set({ rotating_only: rotatingOnly })
    .where("slug", "=", slug)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows ?? 0) > 0;
}

export async function groupAddresses(
  database: Pick<db, "getOrCreateConnection">,
): Promise<Set<string>> {
  const rows = await database
    .getOrCreateConnection()
    .selectFrom("coach_rotating_classes")
    .select("group_email")
    .execute();
  return new Set(rows.map((r) => r.group_email));
}
