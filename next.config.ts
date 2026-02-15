import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG ?? "reqvolt",
      project: process.env.SENTRY_PROJECT ?? "reqvolt",
      silent: !process.env.CI,
    })
  : nextConfig;
