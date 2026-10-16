import type { HijoDelPortal } from '../../hooks/usePortal';
import { Chip } from '../ui/Badge';

interface SelectorEstudianteProps {
  hijos: HijoDelPortal[];
  seleccionado: string | undefined;
  onElegir: (studentId: string) => void;
}

const iniciales = (h: HijoDelPortal): string => `${h.nombre.charAt(0)}${h.apellido.charAt(0)}`.toUpperCase();

/**
 * Selector global del portal: arriba de todo, para que el acudiente con varios estudiantes a cargo cambie de hijo sin salir de la pantalla.
 * Elegir uno recarga todos los componentes de abajo con el id de ese estudiante.
 */
export function SelectorEstudiante({ hijos, seleccionado, onElegir }: SelectorEstudianteProps) {
  return (
    <div role="radiogroup" aria-label="Estudiante" className="flex gap-3 overflow-x-auto pb-1">
      {hijos.map((h) => {
        const activo = h.student_id === seleccionado;
        return (
          <button
            key={h.student_id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onElegir(h.student_id)}
            className={`flex min-w-64 shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              activo ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-primary/40 hover:bg-soft'
            }`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${activo ? 'bg-primary text-white' : 'bg-soft text-body'}`}>{iniciales(h)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {h.nombre} {h.apellido}
              </span>
              <span className="block truncate text-xs text-muted">{h.matricula ? `${h.matricula.grado} · Grupo ${h.matricula.grupo}` : 'Sin matrícula'}</span>
            </span>
            {h.documentos_pendientes > 0 && <Chip tone="orange">{h.documentos_pendientes} por entregar</Chip>}
          </button>
        );
      })}
    </div>
  );
}
