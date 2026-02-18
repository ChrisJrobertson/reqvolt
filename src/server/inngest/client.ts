import { Inngest } from "inngest";
import { sentryMiddleware } from "./sentry-middleware";

export const inngest = new Inngest({
  id: "reqvolt",
  signingKey: process.env.INNGEST_SIGNING_KEY ?? "",
  middleware: [sentryMiddleware],
});
