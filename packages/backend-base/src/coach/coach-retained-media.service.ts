import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";

/**
 * Serving a session's retained recording (change: port-coach-pipeline,
 * task 4.5, design D10).
 *
 * A browser media element cannot send a bearer header, so an authenticated
 * proxy route would be unconsumable by a `<video src>`. The mechanism that
 * actually works is: an authenticated API call checks the requester, MINTS a
 * short-lived address for ONE asset, and object storage serves the bytes —
 * Range requests included — with the API never in the data path.
 *
 * The authorization therefore happens at mint time and nowhere else, which is
 * why a refused request mints nothing rather than minting and denying: an
 * address that was never signed cannot leak.
 */

/**
 * How long a minted address lives.
 *
 * Open question 5, answered provisionally 2026-09-01 (Andy confirms the
 * forwarding residual before cutover): 24 hours. The residual is real and worth
 * restating — a leader who forwards the address inside that window shares the
 * recording with whoever receives it, because storage serves it without
 * knowing who is asking.
 */
export const MINTED_URL_LIFETIME_SECONDS = 24 * 60 * 60;

export type PreferredRecording = "attached" | "retained" | "none";

export interface RetainedMediaState {
  /** Whether VerseMate holds a recording. Never WHERE it is. */
  hasRetainedRecording: boolean;
  /** An admin's pasted external link, which VerseMate does not host. */
  attachedRecordingUrl: string | null;
  /**
   * Which the portal should offer. An admin's pasted link wins: they attached
   * it deliberately, usually because it is the better copy.
   */
  preferred: PreferredRecording;
}

export class RetainedMediaService {
  private readonly storage: Pick<ObjectStorageService, "getGlobalObjectUrl">;

  constructor(
    private readonly db: db,
    storage?: Pick<ObjectStorageService, "getGlobalObjectUrl">,
  ) {
    this.storage = storage ?? new ObjectStorageService();
  }

  /**
   * A short-lived address for ONE session's recording, or null.
   *
   * Null covers every refusal — not this leader's session, no session, no
   * retained asset — deliberately without distinguishing them to the caller:
   * a 'you may not' that differs from a 'there is nothing' tells an unrelated
   * leader which sessions exist.
   */
  async mint(input: {
    reportId: string;
    requesterCoachId: string | null;
    isAdmin: boolean;
  }): Promise<string | null> {
    const conn = this.db.getOrCreateConnection();
    let q = conn
      .selectFrom("coach_session_assets")
      .innerJoin(
        "coach_reports",
        "coach_reports.id",
        "coach_session_assets.report_id",
      )
      .select("coach_session_assets.storage_key")
      .where("coach_session_assets.report_id", "=", input.reportId)
      .where("coach_session_assets.kind", "=", "recording");

    // The program admin reviews any session; a leader sees their own and
    // nothing else. Scoped in the QUERY, so there is no path where the row is
    // fetched and the check is forgotten — the shape of the COACH-1 IDOR.
    if (!input.isAdmin) {
      if (!input.requesterCoachId) return null;
      q = q.where("coach_reports.coach_id", "=", input.requesterCoachId);
    }

    const asset = await q.executeTakeFirst();
    if (!asset) return null;

    return this.storage.getGlobalObjectUrl({
      key: asset.storage_key,
      expiresInSeconds: MINTED_URL_LIFETIME_SECONDS,
    });
  }

  /**
   * What a DETAIL view should say about a session's recording.
   *
   * Deliberately not `recordingUrl`: that field is overlaid onto every row of
   * every list, so carrying a minted address on it would sign one URL per
   * session on every page load, each live for a day. This says only WHETHER
   * material exists; the address comes from `mint`, one session at a time.
   */
  async describe(
    coachId: string,
    reportId: string,
  ): Promise<RetainedMediaState> {
    return (
      (await this.describeMany(coachId, [reportId])).get(reportId) ?? {
        hasRetainedRecording: false,
        attachedRecordingUrl: null,
        preferred: "none",
      }
    );
  }

  /** The same, for a page of sessions — still minting nothing. */
  async describeMany(
    coachId: string,
    reportIds: string[],
  ): Promise<Map<string, RetainedMediaState>> {
    const out = new Map<string, RetainedMediaState>();
    if (reportIds.length === 0) return out;
    const conn = this.db.getOrCreateConnection();

    const [assets, links] = await Promise.all([
      conn
        .selectFrom("coach_session_assets")
        .select("report_id")
        .where("coach_id", "=", coachId)
        .where("kind", "=", "recording")
        .where("report_id", "in", reportIds)
        .execute(),
      conn
        .selectFrom("coach_recording_links")
        .select(["report_id", "recording_url"])
        .where("coach_id", "=", coachId)
        .where("report_id", "in", reportIds)
        .execute(),
    ]);

    const retained = new Set(
      assets.map((a) => a.report_id).filter((id): id is string => Boolean(id)),
    );
    const attached = new Map(
      links
        .filter((l) => l.recording_url.length > 0)
        .map((l) => [l.report_id, l.recording_url]),
    );

    for (const id of reportIds) {
      const attachedUrl = attached.get(id) ?? null;
      const hasRetained = retained.has(id);
      out.set(id, {
        hasRetainedRecording: hasRetained,
        attachedRecordingUrl: attachedUrl,
        preferred: attachedUrl ? "attached" : hasRetained ? "retained" : "none",
      });
    }
    return out;
  }
}
