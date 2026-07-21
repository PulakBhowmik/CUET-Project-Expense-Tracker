/**
 * Email sending, behind a small port so the provider can be swapped.
 *
 * Two adapters:
 *   - **SMTP** (production): used when SMTP_* env vars are configured. Works
 *     with any provider — Gmail App Password, Brevo, Mailjet, etc.
 *   - **Console** (development): prints the message to the terminal. This lets
 *     the whole sign-up flow be tested locally with no email account at all.
 *
 * The console adapter refuses to run in production, so a misconfigured deploy
 * fails loudly instead of silently "sending" codes nowhere.
 */
import { getEnv } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

const consoleMailer: Mailer = {
  name: "console",
  async send({ to, subject, text }) {
    console.info(
      [
        "",
        "──────────── EMAIL (development only) ────────────",
        `To:      ${to}`,
        `Subject: ${subject}`,
        "",
        text,
        "──────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  },
};

function createSmtpMailer(): Mailer {
  const env = getEnv();
  return {
    name: "smtp",
    async send({ to, subject, text }) {
      // Imported lazily so development (console adapter) never loads nodemailer.
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      });
      await transport.sendMail({
        from: env.SMTP_FROM ?? env.SMTP_USER,
        to,
        subject,
        text,
      });
    },
  };
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  const env = getEnv();

  const smtpConfigured =
    !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASSWORD;

  if (smtpConfigured) {
    cached = createSmtpMailer();
    return cached;
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD " +
        "so the app can send sign-in codes.",
    );
  }

  cached = consoleMailer;
  return cached;
}

/** Test seam: reset the memoized mailer. */
export function resetMailer(): void {
  cached = null;
}

export function buildOtpEmail(code: string, minutes: number): EmailMessage {
  return {
    to: "",
    subject: `${code} is your CUET Expense Splitter code`,
    text: [
      `Your verification code is: ${code}`,
      "",
      `It expires in ${minutes} minutes and can only be used once.`,
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
  };
}
