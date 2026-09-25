import type { ReactNode } from 'react';
import { ApiError } from '../../types/api';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from './icons';

type Tone = 'error' | 'success' | 'info' | 'warning';

const TONE_CLASSES: Record<Tone, string> = {
  error: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  info: 'bg-primary-soft text-primary',
  warning: 'bg-warning-soft text-warning',
};

const TONE_ICON: Record<Tone, typeof InfoIcon> = {
  error: XCircleIcon,
  success: CheckCircleIcon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const ToneIcon = TONE_ICON[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${TONE_CLASSES[tone]}`}>
      <ToneIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Extrae un mensaje legible de cualquier error lanzado por react-query/apiClient. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}
