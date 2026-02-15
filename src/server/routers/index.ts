import { router } from "../trpc";
import { workspaceRouter } from "./workspace";
import { projectRouter } from "./project";
import { sourceRouter } from "./source";
import { uploadRouter } from "./upload";
import { packRouter } from "./pack";
import { mondayRouter } from "./monday";

export const appRouter = router({
  workspace: workspaceRouter,
  project: projectRouter,
  source: sourceRouter,
  upload: uploadRouter,
  pack: packRouter,
  monday: mondayRouter,
});

export type AppRouter = typeof appRouter;
