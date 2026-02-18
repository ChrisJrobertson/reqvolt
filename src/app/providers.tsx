"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/lib/trpc";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ThemeProvider>
        <TRPCProvider>{children}</TRPCProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
