"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/lib/trpc";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <TRPCProvider>{children}</TRPCProvider>
    </ClerkProvider>
  );
}
