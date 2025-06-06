import { safePromise } from "../../shared/utils/safe-promise";

interface MailData {
  subject: string;
  to: {
    name: string;
    email: string;
  };
  from?: {
    name: string;
    email: string;
  };
  text: string;
  html?: string;
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

  async sendEmail(data: MailData) {
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

      console.debug(res);

      if (res.status !== 200) {
        console.log(
          `[${EmailNotificationConsumer.name}]: Send email error: ${
            json?.message ?? res.statusText ?? "unknown mail api error"
          }`,
        );
      }
    } else {
      console.debug(
        `[${EmailNotificationConsumer.name}]: sendMail: ${JSON.stringify(
          data,
        )}`,
      );
    }
  }
}
