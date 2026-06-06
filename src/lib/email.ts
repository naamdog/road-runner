import { Resend } from "resend";
import { getConfig, isEmailConfigured } from "@/lib/config";
import { createLogger } from "@/lib/logger";

/**
 * Transactional email via Resend.
 *
 * Graceful degrade: when email is NOT configured (no RESEND_API_KEY / EMAIL_FROM)
 * we log the message (to/subject and any link) and return WITHOUT throwing, so a
 * local dev environment with no Resend key still works end to end. When
 * configured, we send via the Resend SDK.
 */

const log = createLogger({ scope: "email" });

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(getConfig().email!.resendApiKey);
  }
  return resendClient;
}

/**
 * Send a single transactional email. No-op (with a log line) when email is not
 * configured. Never throws on the unconfigured path; surfaces send errors via a
 * logged warning rather than crashing the auth flow.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    log.info(
      { to, subject },
      "Email not configured — skipping send (graceful degrade)"
    );
    return;
  }

  const { from } = getConfig().email!;

  try {
    const { error } = await getResend().emails.send({ from, to, subject, html });
    if (error) {
      log.warn({ to, subject, err: error }, "Resend returned an error");
      return;
    }
    log.info({ to, subject }, "Email sent");
  } catch (err) {
    log.warn({ to, subject, err }, "Failed to send email");
  }
}

/** Brand palette: electric lime accent on a near-black background. */
const ACCENT = "#CCFF00";
const BG = "#0a0a0b";
const CARD = "#141417";
const TEXT = "#e7e7ea";
const MUTED = "#9a9aa2";

/**
 * Minimal, on-brand HTML shell. A single call-to-action button plus a fallback
 * plain-text link (some clients strip button styling).
 */
function layout({
  heading,
  body,
  ctaLabel,
  url,
}: {
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${CARD};border-radius:16px;padding:32px;">
            <tr>
              <td>
                <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};font-weight:700;margin-bottom:8px;">Road Runner</div>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${TEXT};">${heading}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${MUTED};">${body}</p>
                <a href="${url}" style="display:inline-block;background:${ACCENT};color:${BG};text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;">${ctaLabel}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${url}" style="color:${ACCENT};">${url}</a></p>
              </td>
            </tr>
          </table>
          <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.6;color:${MUTED};">If you didn't request this, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Password reset email with the Better Auth reset URL. */
export async function sendPasswordResetEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your Road Runner password",
    html: layout({
      heading: "Reset your password",
      body: "We received a request to reset your password. Click the button below to choose a new one. This link will expire shortly.",
      ctaLabel: "Reset password",
      url,
    }),
  });
}

/** Email-address verification with the Better Auth verification URL. */
export async function sendVerificationEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your Road Runner email",
    html: layout({
      heading: "Verify your email",
      body: "Confirm your email address to finish setting up your Road Runner account.",
      ctaLabel: "Verify email",
      url,
    }),
  });
}
