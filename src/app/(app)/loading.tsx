export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-6">
      <span className="sr-only">Loading your workspace…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="h-3 w-28 rounded bg-line/70" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-line/70" />
        <div className="h-3 w-80 max-w-full rounded bg-line/50" />
      </div>
      <div aria-hidden="true" className="ui-card space-y-5 p-6">
        <div className="flex gap-3"><div className="h-10 w-56 rounded-lg bg-soft" /><div className="h-10 w-24 rounded-lg bg-soft" /></div>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 border-t border-line pt-5"><div className="h-9 w-9 shrink-0 rounded-xl bg-soft" /><div className="h-3 w-1/3 rounded bg-soft" /><div className="ml-auto h-3 w-1/4 rounded bg-soft" /></div>)}
      </div>
    </div>
  );
}
