#!/usr/bin/env bash
# Run after: npx vercel login (visit URL in browser to complete)
# Or: VERCEL_TOKEN=xxx bash scripts/vercel-env-setup.sh
# Usage: bash scripts/vercel-env-setup.sh

set -e

if ! npx vercel whoami &>/dev/null; then
  echo "Not logged in to Vercel. Run: npx vercel login"
  echo "Then visit the URL shown to complete authentication."
  exit 1
fi

echo "Linking project to Vercel (if not already linked)..."
npx vercel link --yes 2>/dev/null || true

echo ""
echo "Adding Clerk redirect env vars..."

for env in production preview development; do
  echo "/sign-in" | npx vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_URL "$env" --force 2>/dev/null || echo "/sign-in" | npx vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_URL "$env"
  echo "/sign-up" | npx vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_URL "$env" --force 2>/dev/null || echo "/sign-up" | npx vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_URL "$env"
  echo "/dashboard" | npx vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL "$env" --force 2>/dev/null || echo "/dashboard" | npx vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL "$env"
  echo "/dashboard" | npx vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL "$env" --force 2>/dev/null || echo "/dashboard" | npx vercel env add NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL "$env"
done

echo ""
echo "Done! Clerk redirect vars added to all environments."
echo ""
echo "NEXT: Add Clerk development keys for Preview (required for *.vercel.app):"
echo "  npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview"
echo "  npx vercel env add CLERK_SECRET_KEY preview"
echo "  (Use pk_test_... and sk_test_... from Clerk Dashboard)"
echo ""
echo "Production should already have pk_live_/sk_live_ in Vercel."
echo ""
