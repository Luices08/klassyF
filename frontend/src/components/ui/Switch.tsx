import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Texto de apoyo bajo la etiqueta (qué pasa al encenderlo). */
  description?: ReactNode;
  disabled?: boolean;
  /** Por qué está bloqueado o no disponible: se muestra como tooltip y bajo la etiqueta. */
  disabledReason?: string | null;
}

/**
 * Interruptor encendido/apagado para decisiones que se toman en el momento (p. ej. estampar la firma al expedir un
 * certificado). Encendido = azul de acción; deshabilitado se atenúa y explica por qué.
 */
export function Switch({ checked, onChange, label, description, disabled, disabledReason }: SwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4" title={disabled && disabledReason ? disabledReason : undefined}>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${disabled ? 'text-muted' : 'text-ink'}`}>{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
        {disabled && disabledReason && <span className="block text-xs text-muted">{disabledReason}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
