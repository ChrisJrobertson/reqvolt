import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const SKIP_VALUES = ["1", "true", "yes"];
const isSkipAuthEnabled = () => {
  const val = process.env.SKIP_AUTH_IN_DEV;
  return (
    process.env.NODE_ENV === "development" &&
    val !== undefined &&
    SKIP_VALUES.includes(val.toLowerCase())
  );
};

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/review/(.*)",
  "/api/webhooks/(.*)",
  "/api/inngest(.*)",
]);

function getCspHeader(): string {
  if (process.env.NODE_ENV !== "production") {
    return "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self' https: wss:; frame-src 'self' https:; worker-src 'self' blob:;";
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.clerk.dev https://js.clerk.dev https://clerk.reqvolt.com https://vercel.live https://*.vercel.live blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' https://img.clerk.com https://images.clerk.dev data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://clerk.reqvolt.com https://*.clerk.accounts.dev https://api.anthropic.com https://api.openai.com https://cloud.langfuse.com https://*.neon.tech https://*.upstash.io https://*.sentry.io https://vercel.live https://*.vercel.live wss: https:",
    "frame-src 'self' https://accounts.reqvolt.com https://accounts.clerk.dev https://clerk.reqvolt.com https://*.clerk.accounts.dev https://vercel.live",
  ].join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function addSecurityHeaders(response: NextResponse, pathname: string): void {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  response.headers.set("Content-Security-Policy", getCspHeader());
  if (pathname.startsWith("/api/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && !isSkipAuthEnabled()) {
    await auth.protect();
  }
  const response = NextResponse.next();
  addSecurityHeaders(response, req.nextUrl.pathname);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
