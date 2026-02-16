import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
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
