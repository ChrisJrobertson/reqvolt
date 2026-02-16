import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-xl font-semibold mb-2">Page not found.</h1>
      <p className="text-muted-foreground mb-4">
        Check the URL or go back to your workspace.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}
