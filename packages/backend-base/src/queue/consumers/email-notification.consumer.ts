import { safePromise } from "../../shared/utils/safe-promise";

export interface MailData {
  subject: string;
  to: {
    name: string;
    email: string;
  };
  from?: {
    name: string;
    email: string;
  };
  /**
   * Where a reply should go, when that is not the From address.
   *
   * Added for coaching delivery (task 6.3a): From has to be the Mailgun-
   * authenticated sending domain or the message fails SPF/DMARC and lands in
   * spam, but a leader replying should reach the coach mailbox. Without this
   * there was no mechanism for that at all.
   */
  replyTo?: {
    name: string;
    email: string;
  };
  text: string;
  html?: string;
}

/**
 * What happened to a send.
 *
 * A RESULT, deliberately, not a thrown error. `auth.service.ts:574` fires the
 * password-reset mail WITHOUT awaiting it, so a throwing sender would surface
 * as an unhandled rejection on a path that is otherwise fine. Every existing
 * caller may ignore this and behave exactly as before; the coaching paths
 * (6.3, 6.5, 6.9) check it, because "confirm three sends" and "reported rather
 * than reported as delivered" are unverifiable if no caller can tell.
 */
export interface SendResult {
  delivered: boolean;
  /** True when the environment does not send at all (dev/test). */
  suppressed?: boolean;
  status?: number;
  error?: string;
}

export class EmailNotificationConsumer {
  private readonly environment!: string;
  private readonly emailFrom!: string;
  private readonly mailgunApiKey!: string;
  private readonly mailgunDomain!: string;

  constructor() {
    console.log(`[${EmailNotificationConsumer.name}]: Initializing...`);

    const environment = process.env.ENVIRONMENT;
    const emailFrom = process.env.EMAIL_FROM;
    const mailgunApiKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;

    if (!environment || !emailFrom || !mailgunApiKey || !mailgunDomain) {
      console.log("environment", Boolean(environment));
      console.log("emailFrom", Boolean(emailFrom));
      console.log("mailgunApiKey", Boolean(mailgunApiKey));
      console.log("mailgunDomain", Boolean(mailgunDomain));

      throw new Error(
        `Missing ${EmailNotificationConsumer.name} environment variables`,
      );
    }

    this.environment = environment;
    this.emailFrom = emailFrom;
    this.mailgunApiKey = mailgunApiKey;
    this.mailgunDomain = mailgunDomain;
  }

  async sendEmail(data: MailData): Promise<SendResult> {
    if (["production", "staging"].includes(this.environment)) {
      const body = new URLSearchParams();
      body.append(
        "from",
        data.from
          ? `${data.from.name} <${data.from.email}>`
          : `MyDomain <${this.emailFrom}>`,
      );
      body.append("to", data.to.email);
      body.append("subject", data.subject);
      body.append("text", data.text);
      if (data.html) {
        body.append("html", data.html);
      }
      if (data.replyTo) {
        // Mailgun passes any `h:` parameter through as a header.
        body.append(
          "h:Reply-To",
          `${data.replyTo.name} <${data.replyTo.email}>`,
        );
      }

      const authBtoa = btoa(`api:${this.mailgunApiKey}`);
      const res = await fetch(
        `https://api.mailgun.net/v3/${this.mailgunDomain}/messages`,
        {
          method: "POST",
          body: body.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${authBtoa}`,
          },
        },
      );

      const [json, jsonError] = await safePromise<{ message: string }>(
        res.json(),
      );
      if (jsonError) {
        console.log(jsonError);
      }

      if (res.status !== 200) {
        const error =
          json?.message ?? res.statusText ?? "unknown mail api error";
        console.log(
          `[${EmailNotificationConsumer.name}]: Send email error: ${error}`,
        );
        return { delivered: false, status: res.status, error };
      }
      return { delivered: true, status: res.status };
    }

    console.debug(
      `[${EmailNotificationConsumer.name}]: sendMail: ${JSON.stringify(data)}`,
    );
    // Not a failure: the environment is not configured to send. Saying
    // `delivered: true` here would let a dev run "confirm three sends".
    return { delivered: false, suppressed: true };
  }
}
