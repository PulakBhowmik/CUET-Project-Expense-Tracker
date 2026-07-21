/**
 * Sends a real test email using the configured SMTP settings.
 * Usage: npx tsx scripts/test-email.ts [recipient]
 */
import "dotenv/config";
import { getMailer } from "../src/lib/mailer";

async function main() {
  const to = process.argv[2] ?? process.env.SMTP_USER;
  if (!to) {
    console.error("No recipient. Pass one: npx tsx scripts/test-email.ts you@example.com");
    process.exit(1);
  }
  const mailer = getMailer();
  console.log(`Using mailer: ${mailer.name}`);
  console.log(`Sending test email to ${to} ...`);
  await mailer.send({
    to,
    subject: "CUET Expense Splitter — SMTP test",
    text: "If you can read this, email sending is configured correctly.",
  });
  console.log("SUCCESS: email accepted by the server.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
