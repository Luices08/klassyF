import type { CatalogoHorario, SesionHorario } from '../../types/horarios';

interface LeyendaAsignaturasProps {
  catalogo: CatalogoHorario;
  /** Solo las asignaturas que aparecen en estas sesiones (por defecto, todas las del catálogo). */
  sesiones?: SesionHorario[];
}

/** El color de cada asignatura con su nombre y su abreviatura: lo que se lee «MAT» en una celda se entiende aquí. */
export function LeyendaAsignaturas({ catalogo, sesiones }: LeyendaAsignaturasProps) {
  const usadas = sesiones ? new Set(sesiones.flatMap((s) => (s.subject_id ? [s.subject_id] : []))) : null;
  const asignaturas = catalogo.asignaturas.filter((a) => !usadas || usadas.has(a._id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (asignaturas.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-body" aria-label="Colores por asignatura">
      {asignaturas.map((a) => (
        <li key={a._id} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border" style={{ backgroundColor: a.color.fondo, borderColor: a.color.borde }} aria-hidden="true" />
          <span className="font-semibold text-ink">{a.abreviatura}</span>
          <span>{a.nombre}</span>
        </li>
      ))}
    </ul>
  );
}
