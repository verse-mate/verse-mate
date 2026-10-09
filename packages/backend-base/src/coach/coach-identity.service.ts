import { sql } from "kysely";

import { CoachIdentityNudge, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import {
  COACH_REPLY_TO_EMAIL,
  COACH_REPLY_TO_NAME,
  noOwnAddress,
} from "./coach-delivery.service";
import { groupAddresses } from "./coach-rotating.service";
import type { CoachMailer, CoachSendResult } from "./coach.service";

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

  async nudge(): Promise<{
    sent: string[];
    skipped: string[];
    failed: string[];
    refusal?: "no-mailer";
  }> {
    const result = {
      sent: [] as string[],
      skipped: [] as string[],
      failed: [] as string[],
    };
    if (!this.mailer) return { ...result, refusal: "no-mailer" };
    const groups = await groupAddresses(this.db);
    const names = new Map(
      (
        await this.db
          .getOrCreateConnection()
          .selectFrom("coach_leaders")
          .select(["slug", "name"])
          .where("slug", "is not", null)
          .execute()
      ).map((l) => [l.slug as string, l.name]),
    );
    const portalUrl = `${process.env.APP_URL ?? ""}/coach`;
    for (const entry of (await this.audit()).entries) {
      if (entry.kind !== "leader" || entry.account === "verified") continue;
      const email = entry.email.trim().toLowerCase();
      if (noOwnAddress(email, groups)) {
        result.skipped.push(email);
        continue;
      }
      const hasAccount = entry.account === "unverified";
      let sent: CoachSendResult | undefined;
      try {
        sent = (await this.mailer.sendEmail({
          to: { name: names.get(entry.id ?? "") ?? "", email },
          replyTo: { name: COACH_REPLY_TO_NAME, email: COACH_REPLY_TO_EMAIL },
          subject: hasAccount
            ? "Confirm your email to see your coaching reports"
            : "Create your VerseMate account to see your coaching reports",
          text: `${hasAccount ? "Confirm this email address in the coaching portal" : "Create your VerseMate account with this email address"} to see your coaching reports: ${portalUrl}`,
          html: await render(
            CoachIdentityNudge({
              name: names.get(entry.id ?? ""),
              hasAccount,
              portalUrl,
            }),
          ),
        })) as CoachSendResult | undefined;
      } catch {
        sent = undefined;
      }
      if (sent?.delivered) result.sent.push(email);
      else result.failed.push(email);
    }
    return result;
  }
}
