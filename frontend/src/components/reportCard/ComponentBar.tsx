const MAX_SCALE = 5;

function barColor(value: number): string {
  if (value >= 4.6) return 'bg-success';
  if (value >= 4.0) return 'bg-primary';
  if (value >= 3.0) return 'bg-warning';
  return 'bg-danger';
}

export function ComponentBar({ label, value }: { label: string; value: number }) {
  const widthPct = Math.max(0, Math.min(100, (value / MAX_SCALE) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0 font-medium text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft">
        <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-semibold text-body">{value.toFixed(1)}</span>
    </div>
  );
}
