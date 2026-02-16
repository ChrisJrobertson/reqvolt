export default function WorkspaceLoading() {
  return (
    <div className="min-h-screen p-8 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded mb-6" />
      <div className="space-y-4">
        <div className="h-12 w-full bg-muted rounded" />
        <div className="h-12 w-3/4 bg-muted rounded" />
        <div className="h-12 w-1/2 bg-muted rounded" />
      </div>
    </div>
  );
}
