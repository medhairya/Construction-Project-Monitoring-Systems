export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-56 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
    </div>
  );
}
