import type { ReactNode } from 'react';
import type { Desempeno } from '../../types/reportCard';

const DESEMPENO_CLASSES: Record<Desempeno, string> = {
  Superior: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Alto: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Básico: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Bajo: 'bg-red-50 text-red-700 ring-red-600/20',
};

export function DesempenoBadge({ value }: { value: Desempeno }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${DESEMPENO_CLASSES[value]}`}
    >
      {value}
    </span>
  );
}

const NEUTRAL_CLASSES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof NEUTRAL_CLASSES }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${NEUTRAL_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
