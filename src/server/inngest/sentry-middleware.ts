/**
 * Inngest middleware: report unhandled errors to Sentry.
 * Does not re-throw — Inngest retry policy is unaffected.
 */
import { InngestMiddleware } from "inngest";
import * as Sentry from "@sentry/nextjs";

export const sentryMiddleware = new InngestMiddleware({
  name: "Inngest: Sentry",
  init: () => ({
    onFunctionRun: ({ fn, ctx }) => ({
      transformOutput: ({ result }) => {
        const error = result?.error;
        if (error && typeof error === "object" && "message" in error) {
          if (process.env.SENTRY_DSN) {
            Sentry.withScope((scope) => {
              scope.setTag("inngest_function", fn.name);
              scope.setTag("inngest_event", ctx.event.name);
              scope.setExtra("run_id", ctx.runId);
              Sentry.captureException(error);
            });
          }
        }
      },
    }),
  }),
});
