import { sql } from "kysely";

import { CoachReshareRequest, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import type { CoachMailer, CoachSendResult } from "./coach.service";

/**
 * Sending a re-share request (change: port-coach-pipeline, task 6.3b).
 *
 * Mailgun is the only channel left: the coach mailbox that sent this on the
 * retired host went with the email path (design D6). The send is recorded
 * against the pending request, so an admin surface can show what was asked and
 * when, and nobody sends the same request twice by accident.
 */

export type ReshareRefusal =
  | "unknown-session"
  | "not-pending"
  | "no-leader-address"
  | "send-failed";

export interface ReshareSendResult {
  sent: boolean;
  refusal?: ReshareRefusal;
  to?: string;
  error?: string;
}

export class CoachReshareService {
  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer,
  ) {}

  /**
   * Ask the leader to re-share one session's recording.
   *
   * Guarded to the program admin by its caller (the route), because it emails a
   * leader: an unguarded endpoint would let anyone who knows a session id send
   * mail in VerseMate's name.
   */
  async send(sourceSessionId: string): Promise<ReshareSendResult> {
    const conn = this.db.getOrCreateConnection();

    const session = await conn
      .selectFrom("coach_intake_sessions")
      .select([
        "source_session_id",
        "coach_id",
        "title",
        "state",
        "retry_count",
        "reshare_requested_at",
        "reshare_resolved_at",
      ])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("source_session_id", "=", sourceSessionId)
      .executeTakeFirst();
    if (!session) return { sent: false, refusal: "unknown-session" };

    // Only a session that actually ran out of retries. Sending on any other
    // state would ask a leader to re-share a recording the system either
    // already has or has not finished trying for.
    const pending =
      session.state === "retrieval_failed" &&
      session.reshare_requested_at !== null &&
      session.reshare_resolved_at === null;
    if (!pending) return { sent: false, refusal: "not-pending" };

    const leader = session.coach_id
      ? await conn
          .selectFrom("coach_leaders")
          .select(["name", "email"])
          .where("slug", "=", session.coach_id)
          .executeTakeFirst()
      : undefined;
    if (!leader?.email) return { sent: false, refusal: "no-leader-address" };

    const sessionLabel = `${session.title || "the session"} — ${session.date}`;
    const html = await render(
      CoachReshareRequest({
        name: leader.name,
        sessionLabel,
        attempts: session.retry_count,
      }),
    );

    const result = (await this.mailer.sendEmail({
      subject: `Could you re-share the recording for ${sessionLabel}?`,
      to: { name: leader.name, email: leader.email },
      text: `We could not retrieve the recording for ${sessionLabel} after ${session.retry_count} attempts. Please reply with a shareable link.`,
      html,
    })) as CoachSendResult | undefined;

    if (result?.delivered !== true) {
      // NOT recorded as sent. A request the leader never received, marked as
      // asked, is how a session waits forever on a reply nobody was invited to
      // give.
      return {
        sent: false,
        refusal: "send-failed",
        to: leader.email,
        error: result?.error,
      };
    }

    await conn
      .updateTable("coach_intake_sessions")
      .set({ reshare_requested_at: sql`NOW()`, updated_at: sql`NOW()` })
      .where("source_session_id", "=", sourceSessionId)
      .execute();

    return { sent: true, to: leader.email };
  }
}
