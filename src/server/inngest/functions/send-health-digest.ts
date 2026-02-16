import { inngest } from "../client";
import { db } from "@/server/db";
import { auditService } from "@/server/services/audit";
import { sendEmail, logEmailSent } from "@/server/services/email";
import {
  healthDigestHtml,
  healthDigestText,
  type HealthDigestParams,
} from "@/lib/email-templates";
import { clerkClient } from "@clerk/nextjs/server";

import { clientEnv } from "@/lib/env";

const BASE_URL = clientEnv.NEXT_PUBLIC_APP_URL ?? "https://app.reqvolt.com";
const STATUS_ORDER = ["outdated", "at_risk", "stale"] as const;

function getTopIssue(factors: Record<string, number> | null): string {
  if (!factors || typeof factors !== "object") return "Unknown";
  const entries = Object.entries(factors).filter(
    (e): e is [string, number] => typeof e[1] === "number"
  );
  if (entries.length === 0) return "Unknown";
  const lowest = entries.reduce((a, b) => (a[1] <= b[1] ? a : b));
  const labels: Record<string, string> = {
    sourceDrift: "Source drift",
    evidenceCoverage: "Evidence coverage",
    qaPassRate: "QA pass rate",
    deliveryFeedback: "Delivery feedback",
    sourceAge: "Source age",
  };
  return `${labels[lowest[0]] ?? lowest[0]}: ${lowest[1]}%`;
}

async function processHealthDigestForFrequency(
  emailFrequency: "daily" | "weekly"
): Promise<{ usersProcessed: number; emailsSent: number }> {
  const prefs = await db.notificationPreference.findMany({
    where: { emailFrequency },
    select: { userId: true, workspaceId: true },
  });

  const workspaceIdsByUser = new Map<string, string[]>();
  for (const pref of prefs) {
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: pref.workspaceId, userId: pref.userId },
    });
    if (!member) continue;
    const list = workspaceIdsByUser.get(pref.userId) ?? [];
    if (!list.includes(pref.workspaceId)) list.push(pref.workspaceId);
    workspaceIdsByUser.set(pref.userId, list);
  }

  const usersProcessed = new Set<string>();
  let emailsSent = 0;

  for (const [userId, workspaceIds] of workspaceIdsByUser) {
    const packs = await db.pack.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        healthStatus: { not: "healthy" },
      },
      include: {
        project: { select: { name: true } },
      },
      orderBy: { healthScore: "asc" },
    });

    if (packs.length === 0) continue;

    const workspaceId = workspaceIds[0] ?? "";

    const sortedPacks = [...packs].sort((a, b) => {
      const aIdx = STATUS_ORDER.indexOf(a.healthStatus as (typeof STATUS_ORDER)[number]);
      const bIdx = STATUS_ORDER.indexOf(b.healthStatus as (typeof STATUS_ORDER)[number]);
      return (aIdx >= 0 ? aIdx : 99) - (bIdx >= 0 ? bIdx : 99);
    });

    const allHealth = await db.packHealth.findMany({
      where: { packId: { in: packs.map((p) => p.id) } },
      orderBy: { computedAt: "desc" },
      select: { packId: true, factors: true },
    });
    const healthMap = new Map<string, Record<string, number> | null>();
    for (const h of allHealth) {
      if (!healthMap.has(h.packId)) {
        healthMap.set(h.packId, h.factors as Record<string, number> | null);
      }
    }

    const digestPacks = sortedPacks.map((pack) => {
      const factors = healthMap.get(pack.id) ?? null;
      const topIssue = getTopIssue(factors);
      const link = `${BASE_URL}/workspace/${pack.workspaceId}/projects/${pack.projectId}/packs/${pack.id}`;
      return {
        name: pack.name,
        projectName: pack.project.name,
        healthScore: pack.healthScore,
        healthStatus: pack.healthStatus,
        topIssue,
        link,
      };
    });

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email = user.emailAddresses[0]?.emailAddress;
      const userName = user.firstName ?? user.username ?? "there";

      if (email) {
        const params: HealthDigestParams = {
          userName,
          packs: digestPacks,
          workspaceId,
        };
        const result = await sendEmail({
          to: email,
          subject: `Reqvolt: ${packs.length} pack(s) need attention`,
          html: healthDigestHtml(params),
          text: healthDigestText(params),
        });
        if (result?.id) {
          emailsSent++;
          await logEmailSent({
            workspaceId,
            userId,
            recipient: email,
            subject: `Reqvolt: ${packs.length} pack(s) need attention`,
            messageId: result.id,
          });
        }
      }
    } catch (err) {
      console.error(`[health-digest] Failed to send to user ${userId}:`, err);
    }

    usersProcessed.add(userId);

    await auditService.log({
      workspaceId,
      userId,
      action: "health_digest_sent",
      entityType: "User",
      entityId: userId,
      metadata: { packCount: packs.length },
    });
  }

  return {
    usersProcessed: usersProcessed.size,
    emailsSent,
  };
}

export const sendHealthDigestDaily = inngest.createFunction(
  { id: "send-health-digest-daily", retries: 2 },
  { cron: "0 8 * * *" },
  async () => {
    const result = await processHealthDigestForFrequency("daily");
    return { status: "completed", ...result };
  }
);

export const sendHealthDigestWeekly = inngest.createFunction(
  { id: "send-health-digest-weekly", retries: 2 },
  { cron: "0 8 * * 1" },
  async () => {
    const result = await processHealthDigestForFrequency("weekly");
    return { status: "completed", ...result };
  }
);
