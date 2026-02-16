import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.VERCEL_ENV ?? "development",
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) {
        const data = event.request.data as string;
        if (
          typeof data === "string" &&
          (data.includes("content") || data.includes("source") || data.includes("email"))
        ) {
          event.request = { ...event.request, data: undefined };
        }
      }
      if (event.user?.email) {
        event.user = { ...event.user, email: undefined };
      }
      return event;
    },
  });
}
