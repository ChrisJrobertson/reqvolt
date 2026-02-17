import { inngest } from "../client";
import { db } from "@/server/db";
import { getAnalysisClient } from "@/lib/ai/model-router";
const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

export const retryPendingSummaries = inngest.createFunction(
  {
    id: "retry-pending-summaries",
    retries: 2,
  },
  { cron: "0 */2 * * *" },
  async () => {
    const impacts = await db.sourceChangeImpact.findMany({
      where: { summaryPending: true },
      take: BATCH_SIZE,
      include: {
        source: { select: { name: true } },
        pack: { select: { id: true, name: true, workspaceId: true } },
      },
    });

    let updated = 0;

    for (const impact of impacts) {
      if (impact.retryCount >= MAX_RETRIES) {
        await db.sourceChangeImpact.update({
          where: { id: impact.id },
          data: {
            summaryPending: false,
            impactSummary:
              "Source changes detected — review affected stories for accuracy.",
          },
        });
        updated++;
        continue;
      }

      try {
        const analysisClient = getAnalysisClient();
        const response = await analysisClient.call({
          workspaceId: impact.pack.workspaceId,
          userId: "system",
          task: "impact_summary",
          packId: impact.packId,
          maxTokens: 120,
          systemPrompt:
            "Summarise how source changes affect requirements. One sentence, UK English.",
          userPrompt: `Source: ${impact.source.name}. Pack: ${impact.pack.name}. ${impact.affectedStoryCount} stories affected, ${impact.affectedAcCount} acceptance criteria. Severity: ${impact.severity}.`,
          sourceIds: [impact.sourceId],
          sourceChunksSent: impact.affectedAcCount,
        });
        const summary = response.skipped ? null : response.text;

        if (summary) {
          await db.sourceChangeImpact.update({
            where: { id: impact.id },
            data: {
              impactSummary: summary,
              summaryPending: false,
            },
          });
          updated++;
        } else {
          await db.sourceChangeImpact.update({
            where: { id: impact.id },
            data: { retryCount: impact.retryCount + 1 },
          });
        }
      } catch {
        await db.sourceChangeImpact.update({
          where: { id: impact.id },
          data: { retryCount: impact.retryCount + 1 },
        });
      }
    }

    return { processed: impacts.length, updated };
  }
);
