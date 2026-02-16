import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const isDev = process.env.NODE_ENV === "development";

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
