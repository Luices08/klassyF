import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'edit' | 'danger' | 'success' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  edit: 'bg-primary-soft text-primary hover:bg-primary-soft/70',
  danger: 'bg-danger-soft text-danger hover:bg-danger-soft/70',
  success: 'bg-success-soft text-success hover:bg-success-soft/70',
  neutral: 'bg-soft text-body hover:bg-border/60',
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  label: string;
  icon: ReactNode;
}

/** Boton circular 32px / icono 16px para acciones por fila en tablas (Klassy UI Spec). */
export function IconButton({ tone = 'neutral', label, icon, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${TONE_CLASSES[tone]} ${className}`}
      {...rest}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    </button>
  );
}
