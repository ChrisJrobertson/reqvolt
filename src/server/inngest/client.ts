import { Inngest } from "inngest";
import { env } from "@/lib/env";
import { sentryMiddleware } from "./sentry-middleware";

export const inngest = new Inngest({
  id: "reqvolt",
  signingKey: env.INNGEST_SIGNING_KEY,
  middleware: [sentryMiddleware],
});
