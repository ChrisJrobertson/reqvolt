import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId } from "@/lib/auth";

export default async function HomePage() {
  const userId = await getAuthUserId();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Reqvolt</h1>
      <p className="text-lg text-muted-foreground mb-8 text-center max-w-md">
        AI-powered Story Packs for agile teams. From mess to method.
      </p>
      <div className="flex gap-4">
        <Link
          href="/sign-in"
          className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-6 py-3 rounded-lg border border-input hover:bg-accent font-medium"
        >
          Sign Up
        </Link>
      </div>
    </main>
  );
}
