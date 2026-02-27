import { router } from "../trpc";
import { workspaceRouter } from "./workspace";
import { projectRouter } from "./project";
import { sourceRouter } from "./source";
import { sourceImpactRouter } from "./source-impact";
import { deliveryFeedbackRouter } from "./delivery-feedback";
import { storyExportRouter } from "./story-export";
import { uploadRouter } from "./upload";
import { packRouter } from "./pack";
import { mondayRouter } from "./monday";
import { notificationRouter } from "./notification";
import { notificationPreferenceRouter } from "./notification-preference";
import { apiKeyRouter } from "./api-key";
import { jiraRouter } from "./jira";
import { importRouter } from "./import";
import { storyCommentRouter } from "./story-comment";
import { dashboardRouter } from "./dashboard";
import { searchRouter } from "./search";
import { onboardingRouter } from "./onboarding";
import { feedbackRouter } from "./feedback";
import { adminQualityRouter } from "./admin-quality";
import { aiProcessingLogRouter } from "./ai-processing-log";
import { evidenceLedgerRouter } from "./evidence-ledger";
import { approvalRouter } from "./approval";
import { baselineRouter } from "./baseline";
import { changeRequestRouter } from "./change-request";
import { projectMemberRouter } from "./project-member";
import { retentionRouter } from "./retention";
import { portfolioRouter } from "./portfolio";
import { methodologyRouter } from "./methodology";
import { complianceRouter } from "./compliance";

export const appRouter = router({
  workspace: workspaceRouter,
  project: projectRouter,
  source: sourceRouter,
  sourceImpact: sourceImpactRouter,
  deliveryFeedback: deliveryFeedbackRouter,
  storyExport: storyExportRouter,
  upload: uploadRouter,
  pack: packRouter,
  monday: mondayRouter,
  notification: notificationRouter,
  notificationPreference: notificationPreferenceRouter,
  apiKey: apiKeyRouter,
  jira: jiraRouter,
  import: importRouter,
  storyComment: storyCommentRouter,
  dashboard: dashboardRouter,
  search: searchRouter,
  onboarding: onboardingRouter,
  feedback: feedbackRouter,
  adminQuality: adminQualityRouter,
  aiProcessingLog: aiProcessingLogRouter,
  evidenceLedger: evidenceLedgerRouter,
  approval: approvalRouter,
  baseline: baselineRouter,
  changeRequest: changeRequestRouter,
  projectMember: projectMemberRouter,
  retention: retentionRouter,
  portfolio: portfolioRouter,
  methodology: methodologyRouter,
  compliance: complianceRouter,
});

export type AppRouter = typeof appRouter;
