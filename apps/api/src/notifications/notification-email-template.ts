import { notificationCopy } from "./notification-content.js";
export type NotificationEmailKind = "PERSONAL" | "ORGANIZATION" | "TEST";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

/** Link-only emails intentionally omit repository names, findings and review contents. */
export function notificationEmailTemplate(
  origin: string,
  kind: NotificationEmailKind,
  eventType?: string,
) {
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("SMTP_CONFIGURATION_INVALID");
  const link = `${url.origin}/notifications`;
  const copy =
    eventType && Object.hasOwn(notificationCopy, eventType)
      ? notificationCopy[eventType]
      : undefined;
  const subject =
    kind === "TEST"
      ? "Preflyt email channel test"
      : copy
        ? `Preflyt: ${copy.title}`
        : "New Preflyt notification";
  const title =
    kind === "TEST"
      ? "Your email channel is connected"
      : (copy?.title ?? "You have a new update");
  const message =
    kind === "TEST"
      ? "This test confirms that your organization’s notification emails can reach this inbox."
      : copy
        ? `${copy.message} Sign in to see the affected repository and event details.`
        : "Sign in to Preflyt to view your latest notification.";
  const footer =
    kind === "PERSONAL"
      ? "Manage your email preferences in your Preflyt inbox."
      : "Sent to an organization notification channel. Your organization admin manages its recipients.";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f7f9;color:#172b3a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f9;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:0 8px 24px;font-size:21px;line-height:28px;font-weight:700;color:#29465b;">Preflyt</td></tr>
        <tr><td style="padding:32px 28px;background-color:#ffffff;border:1px solid #e4e9ee;border-radius:16px;">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:600;color:#172b3a;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#536575;">${escapeHtml(message)}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td bgcolor="#29465b" style="border-radius:8px;background-color:#29465b;">
              <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 20px;border:1px solid #29465b;border-radius:8px;font-size:14px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;">View notifications</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 8px 0;font-size:12px;line-height:20px;color:#627282;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return {
    subject,
    html,
    text: `${title}\n\n${message}\n\nView notifications: ${link}\n\n${footer}`,
  };
}
