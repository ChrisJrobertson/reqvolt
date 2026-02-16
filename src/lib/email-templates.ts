/**
 * Email templates for health digests and immediate notifications.
 * Inline CSS only — no external stylesheets.
 */

const PRIMARY = "#6366F1";
import { clientEnv } from "./env";

const BASE_URL = clientEnv.NEXT_PUBLIC_APP_URL ?? "https://app.reqvolt.com";
const PREFERENCES_LINK = `${BASE_URL}/workspace`;

export interface HealthDigestParams {
  userName: string;
  packs: Array<{
    name: string;
    projectName: string;
    healthScore: number | null;
    healthStatus: string;
    topIssue: string;
    link: string;
  }>;
  workspaceId: string;
}

export function healthDigestHtml(params: HealthDigestParams): string {
  const { userName, packs, workspaceId } = params;
  const prefsUrl = `${PREFERENCES_LINK}/${workspaceId}/settings/notifications`;

  const packRows = packs
    .map(
      (p) => `
    <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.projectName)}<br/>
      Score: ${p.healthScore ?? "—"} | Status: ${escapeHtml(p.healthStatus)}<br/>
      Top issue: ${escapeHtml(p.topIssue)}<br/>
      <a href="${p.link}" style="color: ${PRIMARY};">View pack</a>
    </div>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color:${PRIMARY};margin:0 0 8px 0;font-size:24px;">Reqvolt</h1>
    <p style="color:#6b7280;margin:0 0 24px 0;">Health digest</p>
    <p style="margin:0 0 16px 0;">Hi ${escapeHtml(userName)},</p>
    <p style="margin:0 0 24px 0;">${packs.length} of your packs need attention.</p>
    ${packRows}
    <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;">
      <a href="${prefsUrl}" style="color:${PRIMARY};">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>`;
}

export function healthDigestText(params: HealthDigestParams): string {
  const { userName, packs } = params;
  const lines = [
    `Hi ${userName},`,
    "",
    `${packs.length} of your packs need attention.`,
    "",
    ...packs.flatMap((p) => [
      `${p.name} — ${p.projectName}`,
      `Score: ${p.healthScore ?? "—"} | Status: ${p.healthStatus}`,
      `Top issue: ${p.topIssue}`,
      p.link,
      "",
    ]),
  ];
  return lines.join("\n");
}

export interface ImmediateNotificationParams {
  userName: string;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  workspaceId: string;
}

export function immediateNotificationHtml(params: ImmediateNotificationParams): string {
  const { userName, title, body, actionUrl, actionLabel, workspaceId } = params;
  const fullUrl = actionUrl.startsWith("http") ? actionUrl : `${BASE_URL}${actionUrl}`;
  const prefsUrl = `${PREFERENCES_LINK}/${workspaceId}/settings/notifications`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color:${PRIMARY};margin:0 0 8px 0;font-size:24px;">Reqvolt</h1>
    <p style="color:#6b7280;margin:0 0 24px 0;">Notification</p>
    <p style="margin:0 0 16px 0;">Hi ${escapeHtml(userName)},</p>
    <h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 24px 0;line-height:1.6;">${escapeHtml(body)}</p>
    <p><a href="${fullUrl}" style="display:inline-block;padding:12px 24px;background:${PRIMARY};color:#fff;text-decoration:none;border-radius:8px;">${escapeHtml(actionLabel)}</a></p>
    <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;">
      <a href="${prefsUrl}" style="color:${PRIMARY};">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>`;
}

export function immediateNotificationText(params: ImmediateNotificationParams): string {
  const { userName, title, body, actionUrl, actionLabel } = params;
  const fullUrl = actionUrl.startsWith("http") ? actionUrl : `${BASE_URL}${actionUrl}`;
  return [
    `Hi ${userName},`,
    "",
    title,
    "",
    body,
    "",
    `${actionLabel}: ${fullUrl}`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
