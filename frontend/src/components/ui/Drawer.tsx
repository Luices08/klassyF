import type { FormEvent, ReactNode } from 'react';
import { Button } from './Button';
import { XIcon } from './icons';

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
}

/**
 * Drawer lateral para creacion/edicion (Klassy UI Spec): cabecera con titulo y cerrar,
 * cuerpo desplazable y pie con "Cancelar" + accion principal.
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting,
  submitDisabled,
  children,
}: DrawerProps) {
  if (!open) return null;

  const body = (
    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Cerrar"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        type="button"
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-h3 text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
            {body}
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={isSubmitting} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            </div>
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}
