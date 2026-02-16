export default function PackDetailLoading() {
  return (
    <div className="min-h-screen p-6 space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-6 w-24 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-96 w-full bg-muted rounded" />
        <div className="h-96 lg:col-span-2 bg-muted rounded" />
      </div>
    </div>
  );
}
