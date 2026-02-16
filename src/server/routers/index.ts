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
});

export type AppRouter = typeof appRouter;
