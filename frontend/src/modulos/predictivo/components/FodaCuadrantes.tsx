import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, StarIcon } from '../../../components/ui/icons';
import type { Foda } from '../hooks/usePredictivo';

const CUADRANTES = [
  { clave: 'fortalezas', titulo: 'Fortalezas', icono: StarIcon, clases: 'bg-success-soft text-success' },
  { clave: 'oportunidades', titulo: 'Oportunidades', icono: CheckCircleIcon, clases: 'bg-primary-soft text-primary' },
  { clave: 'debilidades', titulo: 'Debilidades', icono: InfoIcon, clases: 'bg-warning-soft text-warning' },
  { clave: 'amenazas', titulo: 'Amenazas', icono: AlertTriangleIcon, clases: 'bg-danger-soft text-danger' },
] as const;

/** El FODA en cuatro cuadrantes; el título lleva el color y el texto queda en el tono de lectura, para que se lea igual en todos. */
export function FodaCuadrantes({ foda, compacto = false }: { foda: Foda; compacto?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CUADRANTES.map(({ clave, titulo, icono: Icono, clases }) => {
        const elementos = foda[clave];
        return (
          <div key={clave} className={`rounded-xl border border-border bg-surface ${compacto ? 'p-3' : 'p-4'}`}>
            <h4 className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${clases}`}>
              <Icono className="h-3.5 w-3.5" aria-hidden />
              {titulo}
            </h4>
            {elementos.length === 0 ? (
              <p className="text-sm text-muted">Nada que destacar por ahora.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-body">
                {elementos.map((e) => (
                  <li key={e.clave}>{e.texto}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
