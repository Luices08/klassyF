import type { ReactNode } from 'react';
import { ApiError } from '../../types/api';

type Tone = 'error' | 'success' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  error: 'bg-red-50 text-red-700 ring-red-600/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-md p-3 text-sm ring-1 ring-inset ${TONE_CLASSES[tone]}`}>{children}</div>;
}

/** Extrae un mensaje legible de cualquier error lanzado por react-query/apiClient. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}
