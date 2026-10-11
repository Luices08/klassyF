interface StepperProps {
  steps: string[];
  current: number;
  onStepClick?: (step: number) => void;
}

/** Indicador de pasos para formularios largos por secciones (Klassy UI Spec: "1. Identificación -> 2. ..."). */
export function Stepper({ steps, current, onStepClick }: StepperProps) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold">
      {steps.map((label, idx) => {
        const paso = idx + 1;
        const activo = paso === current;
        const completado = paso < current;
        const isClickable = Boolean(onStepClick && paso <= current);

        const content = (
          <>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                activo
                  ? 'bg-primary text-white shadow-xs'
                  : completado
                    ? 'bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white'
                    : 'bg-soft text-muted'
              }`}
            >
              {paso}
            </span>
            <span className={activo ? 'text-ink font-bold' : completado ? 'text-ink group-hover:text-primary' : 'text-muted'}>
              {label}
            </span>
          </>
        );

        return (
          <li key={label} className="flex items-center gap-2">
            {isClickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(paso)}
                className="group flex items-center gap-2 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded py-0.5"
                title={`Ir al paso ${paso}: ${label}`}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-2">{content}</div>
            )}
            {paso < steps.length && <span className="mx-1 h-px w-4 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
