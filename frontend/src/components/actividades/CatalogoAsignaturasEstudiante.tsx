import { obtenerEstiloAsignatura } from '../../lib/asignaturasEstilos';
import { Card } from '../ui/Card';
import { ChevronRightIcon, FileTextIcon, UserIcon } from '../ui/icons';

export interface AsignaturaEstudianteCard {
  id: string;
  nombre: string;
  areaNombre?: string;
  docenteNombre?: string;
  gradoGrupo?: string;
  totalActividades: number;
  pendientes: number;
  proximas: number;
}

interface CatalogoAsignaturasEstudianteProps {
  asignaturas: AsignaturaEstudianteCard[];
  onSeleccionarAsignatura: (id: string) => void;
}

/**
 * Vista 1 del estudiante: Catálogo de asignaturas matriculadas con sus iconos,
 * colores temáticos, docente a cargo y resumen de actividades.
 */
export function CatalogoAsignaturasEstudiante({
  asignaturas,
  onSeleccionarAsignatura,
}: CatalogoAsignaturasEstudianteProps) {
  if (asignaturas.length === 0) {
    return (
      <Card className="p-8 text-center text-muted">
        <p className="text-base font-medium text-ink">No tienes asignaturas activas</p>
        <p className="mt-1 text-sm">
          Aún no tienes asignaturas registradas en tu matrícula del año lectivo vigente.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado del catálogo */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 text-ink">Asignaturas ({asignaturas.length})</h2>
          <p className="text-sm text-muted">Selecciona una materia para consultar o entregar tus actividades.</p>
        </div>
        <div className="hidden rounded-full border border-border bg-surface px-3.5 py-1 text-xs font-medium text-muted shadow-xs sm:inline-block">
          {asignaturas.length} {asignaturas.length === 1 ? 'asignatura en total' : 'asignaturas en total'}
        </div>
      </div>

      {/* Grilla responsiva de tarjetas según diseño de referencia */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {asignaturas.map((asig) => {
          const { Icon, contenedorClases, bordeClases } = obtenerEstiloAsignatura(asig.nombre, asig.areaNombre);

          return (
            <div
              key={asig.id}
              onClick={() => onSeleccionarAsignatura(asig.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSeleccionarAsignatura(asig.id);
                }
              }}
              tabIndex={0}
              role="button"
              className={`group flex flex-col justify-between rounded-xl border border-border bg-surface p-5 transition-all hover:scale-[1.01] hover:shadow-md active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${bordeClases}`}
            >
              <div>
                {/* Cabecera de la tarjeta: Icono y datos de materia */}
                <div className="flex items-start gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${contenedorClases}`}>
                    <Icon className="h-6 w-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-ink group-hover:text-primary transition-colors" title={asig.nombre}>
                      {asig.nombre}
                    </h3>
                    {asig.docenteNombre && (
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted" title={asig.docenteNombre}>
                        <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="truncate">{asig.docenteNombre}</span>
                      </p>
                    )}
                    {asig.gradoGrupo && (
                      <p className="mt-0.5 text-xs text-muted">
                        {asig.gradoGrupo}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Píldora inferior de resumen */}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-soft/60 p-2.5 transition-colors group-hover:bg-primary-soft/40 group-hover:border-primary/30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary shadow-xs">
                    <FileTextIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">
                      {asig.totalActividades} {asig.totalActividades === 1 ? 'actividad' : 'actividades'}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {asig.pendientes === 0
                        ? 'Al día'
                        : asig.proximas > 0
                          ? `${asig.proximas} próxima${asig.proximas > 1 ? 's' : ''}`
                          : `${asig.pendientes} pendiente${asig.pendientes > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>

                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
