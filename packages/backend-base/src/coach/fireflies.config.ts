/**
 * The Fireflies credential (change: port-coach-pipeline, task 4.0).
 *
 * On the retired host this key lived in `/etc/fireflies-env` and was read by
 * `fireflies_client.py`. Intake cannot work without it, and delivery cannot work
 * without the Mailgun credentials — which VerseMate already carries
 * (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`), so this is the only credential the port
 * adds.
 *
 * ACCEPTED RISK, recorded rather than left as an oversight: the poll asks for
 * team-wide results (`mine: false`), which Fireflies grants to an ADMIN key.
 * The provider offers no narrower read-only scope for team transcripts, so the
 * key VerseMate holds is broader than the coaching pipeline needs. It is stored
 * as a deployment secret and used only by the coach intake worker.
 */

const ENV_VAR = "FIREFLIES_API_KEY";

/** True when a usable key is present. Blank and whitespace do not count. */
export function firefliesConfigured(): boolean {
  return (process.env[ENV_VAR] ?? "").trim().length > 0;
}

/**
 * The key, or a loud failure naming the variable.
 *
 * Deliberately throws rather than returning null: an unset credential and a
 * genuinely quiet week both produce "no new sessions", and only one of them is
 * fine. A caller that degrades silently turns a missing secret into a leader
 * receiving no reports and nobody noticing.
 */
export function firefliesApiKey(): string {
  const key = (process.env[ENV_VAR] ?? "").trim();
  if (!key) {
    throw new Error(
      `${ENV_VAR} is not set. Coach session intake cannot run without it; set it as a deployment secret (it was /etc/fireflies-env on the old host).`,
    );
  }
  return key;
}
