import { type FormEvent } from 'react';
import { formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona } from '../../lib/planeacion';
import { cargarArchivoPlanAula, useAdoptarPlanAula } from '../../hooks/usePlanesAula';
import type { PlanAdoptable } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';

interface AdoptarPlanDrawerProps {
  /** null = cerrado. */
  plan: PlanAdoptable | null;
  /** Para decir de qué se trata: «Matemáticas · Sexto · Periodo 2». */
  contexto: string;
  onClose: () => void;
  /** Prefiere no adoptarlo y subir uno propio: abre el formulario de carga. */
  onSubirAjustado: () => void;
}

/**
 * El docente que llegó a reemplazar a otro ve su plan de aula ya aprobado y decide: adoptarlo (queda habilitado al instante, sin una nueva
 * revisión de coordinación) o subir uno ajustado, que sigue el camino normal de revisión.
 */
export function AdoptarPlanDrawer({ plan, contexto, onClose, onSubirAjustado }: AdoptarPlanDrawerProps) {
  const adoptar = useAdoptarPlanAula();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    adoptar.reset();
    try {
      await adoptar.mutateAsync(plan.plan_id);
      onClose();
    } catch {
      // El error queda en `adoptar.error` y se muestra aquí mismo.
    }
  }

  return (
    <Drawer
      open={plan !== null}
      title="Adoptar el plan de aula del docente anterior"
      subtitle={contexto}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Adoptar este plan"
      isSubmitting={adoptar.isPending}
      onBack={() => {
        onClose();
        onSubirAjustado();
      }}
      backLabel="Subir un nuevo plan ajustado"
      size="lg"
    >
      {adoptar.isError && <Alert tone="error">{errorMessage(adoptar.error)}</Alert>}
      {plan && (
        <>
          <Alert tone="info">
            Este plan ya fue aprobado por coordinación para {contexto}. Si lo adoptas, quedas habilitado de inmediato para programar actividades y
            coordinación no tiene que revisarlo de nuevo. Si necesitas cambios, sube un plan ajustado: ese sí pasa por revisión.
          </Alert>
          <Card>
            <p className="text-label uppercase tracking-wide text-muted">Docente anterior</p>
            <p className="mt-0.5 font-semibold text-ink">{nombreDePersona(plan.docente)}</p>
            <h3 className="mt-3 text-h3 text-ink">{plan.titulo}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-body">{plan.descripcion}</p>
            {plan.aprobado_en && <p className="mt-2 text-xs text-muted">Aprobado el {formatoFechaHora(plan.aprobado_en)}.</p>}
          </Card>
          <VistaPreviaPdf
            claveConsulta={['adoptar', plan.plan_id]}
            cargar={() => cargarArchivoPlanAula(plan.plan_id)}
            nombreArchivo="plan-de-aula.pdf"
            titulo="Plan que vas a adoptar"
            altoVisor="h-[55vh]"
          />
        </>
      )}
    </Drawer>
  );
}
