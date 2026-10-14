import { formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona, textoUltimoEnvio, textoVentana } from '../../lib/planeacion';
import type { PeriodoTarjetaPlanAula, PlanAdoptable, TarjetaPlanAula } from '../../types/domain';
import { Alert } from '../ui/Alert';
import { Chip, EstadoPlanBadge, EstadoVentanaBadge, FueraDePlazoChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface TarjetaPlanAulaCardProps {
  tarjeta: TarjetaPlanAula;
  onCargar: (periodo: PeriodoTarjetaPlanAula) => void;
  onVer: (planId: string) => void;
  onAdoptar: (periodo: PeriodoTarjetaPlanAula, plan: PlanAdoptable) => void;
}

/**
 * La «carpeta» de una asignatura y grado del docente, con una casilla por periodo: su estado, cuándo abre y cierra la entrega, lo que
 * coordinación comentó y lo que puede hacer ahora (cargar, responder, adoptar el plan del docente anterior o solo consultar).
 */
export function TarjetaPlanAulaCard({ tarjeta, onCargar, onVer, onAdoptar }: TarjetaPlanAulaCardProps) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-label uppercase tracking-wide text-muted">{tarjeta.area.nombre}</p>
          <h2 className="text-h3 text-ink">
            {tarjeta.asignatura.nombre} · {tarjeta.grado.nombre}
          </h2>
          <p className="text-sm text-muted">{tarjeta.grupos.length === 1 ? 'Grupo' : 'Grupos'} {tarjeta.grupos.join(', ')} · un solo plan para todos los grupos del grado</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Plan de área</span>
          <EstadoPlanBadge value={tarjeta.plan_area.estado} />
        </div>
      </div>

      {tarjeta.plan_area.estado !== 'APROBADO' && (
        <Alert tone="info">
          El plan de área de {tarjeta.area.nombre} todavía no está aprobado{tarjeta.plan_area.detalle ? ` (${tarjeta.plan_area.detalle})` : ''}: cuando coordinación lo
          apruebe podrás cargar tu plan de aula de cada periodo.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tarjeta.periodos.map((periodo) => {
          const plan = periodo.plan;
          const ultima = plan?.ultima_revision;
          const hayOferta = periodo.adoptables.length > 0;
          return (
            <div key={periodo.numero} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">{periodo.nombre}</h3>
                <EstadoPlanBadge value={periodo.estado} />
              </div>

              {periodo.ventana && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">Entrega: {textoVentana(periodo.ventana)}</p>
                  {periodo.ventana.estado && <EstadoVentanaBadge value={periodo.ventana.estado} />}
                </div>
              )}

              {plan && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-ink">{plan.titulo}</p>
                  <p className="text-xs text-muted">{textoUltimoEnvio(plan.radicado_en, plan.version_actual)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.radicacion.fuera_de_plazo && <FueraDePlazoChip fecha={plan.radicacion.fecha} />}
                    {plan.origen === 'ADOPTADA' && <Chip tone="green">Adoptado de {nombreDePersona(plan.adoptado_de?.docente)}</Chip>}
                  </div>
                  {periodo.estado === 'DEVUELTO' && ultima && (
                    <div className="rounded-lg bg-danger-soft p-2 text-sm text-danger">
                      <p className="whitespace-pre-line">{ultima.comentario}</p>
                      <p className="mt-1 text-xs">
                        {nombreDePersona(ultima.revisor)} · {formatoFechaHora(ultima.fecha)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {hayOferta && (
                <div className="space-y-2 rounded-lg bg-primary-soft p-3 text-sm text-primary">
                  <p className="font-semibold">
                    {periodo.adoptables.length === 1
                      ? `${nombreDePersona(periodo.adoptables[0]?.docente)} dejó aprobado su plan de este periodo.`
                      : 'Hay planes aprobados de docentes anteriores en este periodo.'}
                  </p>
                  <div className="flex flex-col gap-2">
                    {periodo.adoptables.map((adoptable) => (
                      <Button key={adoptable.plan_id} type="button" onClick={() => onAdoptar(periodo, adoptable)}>
                        Adoptar el plan de aula{periodo.adoptables.length > 1 ? ` de ${nombreDePersona(adoptable.docente)}` : ' del docente anterior'}
                      </Button>
                    ))}
                    {periodo.puede_cargar && (
                      <Button type="button" variant="outline" onClick={() => onCargar(periodo)}>
                        Subir un nuevo plan de aula ajustado
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {periodo.puede_cargar && !hayOferta && (
                  <Button type="button" variant={periodo.estado === 'DEVUELTO' ? 'primary' : 'outline'} onClick={() => onCargar(periodo)}>
                    {periodo.estado === 'DEVUELTO' ? 'Responder observaciones' : 'Cargar plan'}
                  </Button>
                )}
                {plan && (
                  <Button type="button" variant="secondary" onClick={() => onVer(plan._id)}>
                    Ver plan
                  </Button>
                )}
              </div>
              {!periodo.puede_cargar && periodo.estado === 'SIN_CARGAR' && periodo.bloqueo && !hayOferta && (
                <p className="text-xs text-muted">{periodo.bloqueo.mensaje}</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
