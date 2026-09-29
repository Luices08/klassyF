import type { Tone } from './Badge';

const FILL_CLASSES: Record<Tone, string> = {
  blue: 'bg-primary',
  green: 'bg-success',
  orange: 'bg-warning',
  red: 'bg-danger',
  neutral: 'bg-muted',
};

interface ProgressBarProps {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
}

/** Barra de avance (p. ej. semanas lectivas contra el minimo de 40): pista gris suave, relleno del tono. */
export function ProgressBar({ value, max, tone = 'blue', label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-soft"
    >
      <div className={`h-full rounded-full ${FILL_CLASSES[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
