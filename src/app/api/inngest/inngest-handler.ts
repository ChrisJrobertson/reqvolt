import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { extractSourceText } from "@/server/inngest/functions/extract-source-text";
import { replaceExtractSourceText } from "@/server/inngest/functions/replace-extract-source-text";
import { chunkAndEmbed } from "@/server/inngest/functions/chunk-and-embed";
import { detectSourceChanges } from "@/server/inngest/functions/detect-source-changes";
import { checkNewSourceRelevance } from "@/server/inngest/functions/check-new-source-relevance";
import { retryPendingSummaries } from "@/server/inngest/functions/retry-pending-summaries";
import { recomputePackHealth } from "@/server/inngest/functions/recompute-pack-health";
import { syncMondayFeedback } from "@/server/inngest/functions/sync-monday-feedback";
import { syncJiraFeedback } from "@/server/inngest/functions/sync-jira-feedback";
import { sendHealthDigestDaily } from "@/server/inngest/functions/send-health-digest";
import { sendHealthDigestWeekly } from "@/server/inngest/functions/send-health-digest";
import { sendImmediateEmail } from "@/server/inngest/functions/send-immediate-email";
import { cleanupOldData } from "@/server/inngest/functions/cleanup-old-data";
import { processInboundEmail } from "@/server/inngest/functions/process-inbound-email";
import { detectConflictsJob } from "@/server/inngest/functions/detect-conflicts";

export const handler = serve({
  client: inngest,
  functions: [
    extractSourceText,
    replaceExtractSourceText,
    chunkAndEmbed,
    detectSourceChanges,
    checkNewSourceRelevance,
    retryPendingSummaries,
    recomputePackHealth,
    syncMondayFeedback,
    syncJiraFeedback,
    sendHealthDigestDaily,
    sendHealthDigestWeekly,
    sendImmediateEmail,
    cleanupOldData,
    processInboundEmail,
    detectConflictsJob,
  ],
});
