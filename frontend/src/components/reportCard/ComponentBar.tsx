const MAX_SCALE = 5;

function barColor(value: number): string {
  if (value >= 4.6) return 'bg-emerald-500';
  if (value >= 4.0) return 'bg-sky-500';
  if (value >= 3.0) return 'bg-amber-500';
  return 'bg-red-500';
}

export function ComponentBar({ label, value }: { label: string; value: number }) {
  const widthPct = Math.max(0, Math.min(100, (value / MAX_SCALE) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0 font-medium text-slate-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-semibold text-slate-700">{value.toFixed(1)}</span>
    </div>
  );
}
