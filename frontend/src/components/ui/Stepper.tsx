/** Indicador de pasos para formularios largos por secciones (Klassy UI Spec: "1. Identificación -> 2. ..."). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold">
      {steps.map((label, idx) => {
        const paso = idx + 1;
        const activo = paso === current;
        const completado = paso < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                activo
                  ? 'bg-primary text-white'
                  : completado
                    ? 'bg-primary-soft text-primary'
                    : 'bg-soft text-muted'
              }`}
            >
              {paso}
            </span>
            <span className={activo ? 'text-ink' : 'text-muted'}>{label}</span>
            {paso < steps.length && <span className="mx-1 h-px w-4 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
