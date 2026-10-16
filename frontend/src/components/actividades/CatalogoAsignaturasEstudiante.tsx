import { obtenerEstiloAsignatura } from '../../lib/asignaturasEstilos';
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
 * Vista 1 del estudiante: Catálogo de asignaturas con tarjetas amplias,
 * barrita superior de color temático, icono grande, datos del docente y píldora de actividades.
 */
export function CatalogoAsignaturasEstudiante({
  asignaturas,
  onSeleccionarAsignatura,
}: CatalogoAsignaturasEstudianteProps) {
  if (asignaturas.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">
        <p className="text-base font-semibold text-ink">No tienes asignaturas activas</p>
        <p className="mt-1.5 text-sm">
          Aún no tienes asignaturas registradas en tu matrícula del año lectivo vigente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado del catálogo */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-h2 text-ink font-bold">Asignaturas ({asignaturas.length})</h2>
          <p className="text-sm text-muted">Selecciona una materia para consultar o entregar tus actividades.</p>
        </div>
        <div className="hidden rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-muted shadow-xs sm:inline-block">
          {asignaturas.length} {asignaturas.length === 1 ? 'asignatura en total' : 'asignaturas en total'}
        </div>
      </div>

      {/* Grilla responsiva de tarjetas amplias según diseño de referencia */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {asignaturas.map((asig) => {
          const { Icon, contenedorClases, bordeClases, barraColor } = obtenerEstiloAsignatura(
            asig.nombre,
            asig.areaNombre
          );

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
              className={`group relative flex min-h-[250px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-6 pt-7 shadow-xs transition-all hover:scale-[1.015] hover:shadow-lg active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${bordeClases}`}
            >
              {/* Barrita superior temática curvada en las esquinas */}
              <div className={`absolute inset-x-0 top-0 h-1 sm:h-1.5 ${barraColor}`} />
              {/* Parte superior: Icono grande y datos de la materia */}
              <div>
                <div className="flex items-start gap-4">
                  {/* Icono temático ampliado */}
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${contenedorClases}`}
                  >
                    <Icon className="h-8 w-8" />
                  </div>

                  {/* Nombre y detalles con tipografía mayor */}
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-lg font-bold text-ink group-hover:text-primary transition-colors sm:text-xl"
                      title={asig.nombre}
                    >
                      {asig.nombre}
                    </h3>

                    {asig.docenteNombre && (
                      <p
                        className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-muted"
                        title={`Profe. ${asig.docenteNombre}`}
                      >
                        <UserIcon className="h-4 w-4 shrink-0 text-muted/80" />
                        <span className="truncate">Profe. {asig.docenteNombre}</span>
                      </p>
                    )}

                    {asig.gradoGrupo && (
                      <p className="mt-1 text-xs text-muted">
                        Grado: {asig.gradoGrupo}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Píldora inferior de resumen con mayor presencia */}
              <div className="mt-6 flex items-center justify-between rounded-2xl border border-border/80 bg-[#f8fafc] p-3.5 transition-all group-hover:border-primary/40 group-hover:bg-primary-soft/30 sm:p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-white text-primary shadow-xs">
                    <FileTextIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {asig.totalActividades} {asig.totalActividades === 1 ? 'actividad' : 'actividades'}
                    </p>
                    <p className="truncate text-xs text-muted mt-0.5">
                      {asig.pendientes === 0
                        ? 'Al día 🎉'
                        : asig.proximas > 0
                          ? `${asig.proximas} próxima${asig.proximas > 1 ? 's' : ''} entrega${asig.proximas > 1 ? 's' : ''}`
                          : `${asig.pendientes} pendiente${asig.pendientes > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>

                <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
