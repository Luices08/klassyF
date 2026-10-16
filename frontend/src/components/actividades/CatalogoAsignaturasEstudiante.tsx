import { obtenerEstiloAsignatura } from '../../lib/asignaturasEstilos';
import { diasParaEntrega, formatoDiaCorto } from '../../lib/actividades';
import { ContadorInsignia } from '../notificaciones/ContadorInsignia';
import { Chip } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { ChevronRightIcon, UserIcon } from '../ui/icons';

export interface AsignaturaEstudianteCard {
  id: string;
  nombre: string;
  areaNombre?: string;
  docenteNombre?: string;
  gradoGrupo?: string;
  totalActividades: number;
  /** Sin entregar y aún sin nota. */
  pendientes: number;
  /** Pendientes con la fecha límite ya pasada. */
  vencidas: number;
  /** Entregadas (a tiempo o con retraso) que esperan nota. */
  entregadas: number;
  calificadas: number;
  /** Fecha límite más cercana entre las pendientes que no han vencido. */
  proximaEntrega?: string;
  /** Novedades sin ver de esta asignatura (punto rojo). */
  novedades: number;
}

interface CatalogoAsignaturasEstudianteProps {
  asignaturas: AsignaturaEstudianteCard[];
  onSeleccionarAsignatura: (id: string) => void;
}

function textoProximaEntrega(iso: string): string {
  const dias = diasParaEntrega(iso);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return formatoDiaCorto(iso);
}

/**
 * Vista 1 del estudiante: una tarjeta por asignatura con el docente y un bloque de actividades que dice cómo va (avance, qué falta y
 * cuándo es la próxima entrega). Solo usa los tokens de Klassy: el icono distingue la materia, el color solo comunica estado.
 */
export function CatalogoAsignaturasEstudiante({ asignaturas, onSeleccionarAsignatura }: CatalogoAsignaturasEstudianteProps) {
  if (asignaturas.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">
        <p className="text-base font-semibold text-ink">No tienes asignaturas activas</p>
        <p className="mt-1.5 text-sm">Aún no tienes asignaturas registradas en tu matrícula del año lectivo vigente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h3 text-ink">Asignaturas ({asignaturas.length})</h2>
        <p className="text-sm text-muted">Selecciona una materia para consultar o entregar tus actividades.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {asignaturas.map((asig) => {
          const { Icon } = obtenerEstiloAsignatura(asig.nombre, asig.areaNombre);
          const hechas = asig.entregadas + asig.calificadas;
          const alDia = asig.pendientes === 0;

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
              aria-label={`Abrir las actividades de ${asig.nombre}`}
              className="group relative flex cursor-pointer flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span className="absolute -right-2 -top-2">
                <ContadorInsignia valor={asig.novedades} />
              </span>

              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-ink transition-colors group-hover:text-primary" title={asig.nombre}>
                    {asig.nombre}
                  </h3>
                  {asig.docenteNombre && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted" title={`Profe. ${asig.docenteNombre}`}>
                      <UserIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">Profe. {asig.docenteNombre}</span>
                    </p>
                  )}
                  {asig.gradoGrupo && <p className="mt-0.5 text-xs text-muted">{asig.gradoGrupo}</p>}
                </div>
              </div>

              <div className="space-y-2.5 rounded-xl bg-soft p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {asig.totalActividades} {asig.totalActividades === 1 ? 'actividad' : 'actividades'}
                  </p>
                  {asig.totalActividades === 0 ? (
                    <Chip>Sin publicar</Chip>
                  ) : alDia ? (
                    <Chip tone="green">Al día</Chip>
                  ) : (
                    <Chip tone={asig.vencidas > 0 ? 'red' : 'orange'}>
                      {asig.pendientes} {asig.pendientes === 1 ? 'pendiente' : 'pendientes'}
                    </Chip>
                  )}
                </div>

                {asig.totalActividades > 0 && (
                  <>
                    <ProgressBar value={hechas} max={asig.totalActividades} tone="green" label={`${hechas} de ${asig.totalActividades} actividades entregadas`} />
                    <p className="text-xs text-muted">
                      {hechas} de {asig.totalActividades} entregadas
                      {asig.calificadas > 0 ? ` · ${asig.calificadas} ${asig.calificadas === 1 ? 'calificada' : 'calificadas'}` : ''}
                    </p>
                    {asig.vencidas > 0 && (
                      <p className="text-xs font-semibold text-danger">
                        {asig.vencidas} {asig.vencidas === 1 ? 'vencida' : 'vencidas'} sin entregar
                      </p>
                    )}
                    {asig.proximaEntrega && (
                      <p className="text-xs text-body">
                        Próxima entrega: <span className="font-semibold text-ink">{textoProximaEntrega(asig.proximaEntrega)}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between text-sm font-semibold text-primary">
                <span>Ver actividades</span>
                <ChevronRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
