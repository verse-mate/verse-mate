import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import type { CoachMailer } from "./coach.service";

export type AccountState = "none" | "unverified" | "verified";

export interface IdentityEntry {
  kind: "leader" | "admin";
  id: string | null;
  email: string;
  account: AccountState;
}

export class CoachIdentityService {
  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer | null,
  ) {}

  async audit(): Promise<{ entries: IdentityEntry[]; atRisk: number }> {
    const conn = this.db.getOrCreateConnection();
    const accountOf = sql<AccountState>`CASE
      WHEN u.id IS NULL THEN 'none'
      WHEN u."emailVerified" THEN 'verified'
      ELSE 'unverified' END`;
    const leaders = await conn
      .selectFrom("coach_leaders as l")
      .leftJoin("user as u", (join) =>
        join.on(sql`lower(u.email)`, "=", sql`lower(l.email)`),
      )
      .select(["l.slug as id", "l.email as email"])
      .select(accountOf.as("account"))
      .where("l.slug", "is not", null)
      .where("l.is_coach", "=", true)
      .orderBy("l.slug")
      .execute();
    const admins = await conn
      .selectFrom("coach_admins as a")
      .leftJoin("user as u", (join) =>
        join.on(sql`lower(u.email)`, "=", sql`lower(a.email)`),
      )
      .select(["a.email as email"])
      .select(accountOf.as("account"))
      .orderBy("a.email")
      .execute();
    const entries: IdentityEntry[] = [
      ...admins.map((a) => ({
        kind: "admin" as const,
        id: null,
        email: a.email,
        account: a.account,
      })),
      ...leaders.map((l) => ({
        kind: "leader" as const,
        id: l.id,
        email: l.email,
        account: l.account,
      })),
    ];
    return {
      entries,
      atRisk: entries.filter((e) => e.account !== "verified").length,
    };
  }
}
