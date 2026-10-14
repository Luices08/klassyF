import { type FormEvent, useState } from 'react';
import { formatoFechaCalendario, formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona, textoVentana } from '../../lib/planeacion';
import { cargarArchivoDocumento, useDocumentosReferencia } from '../../hooks/useDocumentosReferencia';
import { cargarArchivoPlanArea } from '../../hooks/usePlanesArea';
import { cargarArchivoPlanAula, useRadicarPlanAula } from '../../hooks/usePlanesAula';
import type { PeriodoTarjetaPlanAula, TarjetaPlanAula } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { type DocumentoPanelPdf, PanelDocumentosPdf } from '../ui/PanelDocumentosPdf';
import { CamposRadicacion } from './CamposRadicacion';

interface PlanAulaDrawerProps {
  open: boolean;
  onClose: () => void;
  anioId: string;
  tarjeta: TarjetaPlanAula;
  periodo: PeriodoTarjetaPlanAula;
}

/**
 * Radicar el plan de aula de un periodo, o responder a lo que coordinación devolvió. A un lado el formulario (título, descripción y el
 * PDF) y al otro el visor con el plan de área aprobado y los documentos de apoyo de ese grado. El formulario de reenvío sigue disponible
 * mientras el plan esté devuelto, haya vencido o no la fecha límite; solo un plan aprobado deja de recibir cambios.
 */
export function PlanAulaDrawer({ open, onClose, anioId, tarjeta, periodo }: PlanAulaDrawerProps) {
  const respondiendo = periodo.estado === 'DEVUELTO' && periodo.plan !== null;
  const [titulo, setTitulo] = useState(periodo.plan?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(periodo.plan?.descripcion ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const radicar = useRadicarPlanAula();
  const apoyo = useDocumentosReferencia({ area_id: tarjeta.area._id, grade_id: tarjeta.grado._id }, open);

  // Casi siempre es un solo plan de área; son varios si los grupos del docente caen bajo líderes distintos (p. ej. diurna y nocturna).
  const planesArea = tarjeta.plan_area.planes_aprobados_ids;
  const documentos: DocumentoPanelPdf[] = [
    ...planesArea.map((planAreaId, i) => ({
      clave: `plan-area-${planAreaId}`,
      titulo: `Plan de área de ${tarjeta.area.nombre}${planesArea.length > 1 ? ` (${i + 1} de ${planesArea.length})` : ''}`,
      grupo: 'Plan de área aprobado',
      nombreArchivo: 'plan-de-area.pdf',
      cargar: () => cargarArchivoPlanArea(planAreaId),
    })),
    ...(apoyo.data ?? []).map((d) => ({
      clave: `apoyo-${d._id}`,
      titulo: d.titulo,
      grupo: 'Documentos de apoyo',
      nombreArchivo: d.archivo.nombre,
      cargar: () => cargarArchivoDocumento(d._id),
    })),
    ...(periodo.plan
      ? [
          {
            clave: `mi-plan-${periodo.plan._id}-${periodo.plan.version_actual}`,
            titulo: `Tu último envío (versión ${periodo.plan.version_actual})`,
            grupo: 'Tu plan',
            nombreArchivo: periodo.plan.archivo_nombre,
            cargar: () => cargarArchivoPlanAula(periodo.plan!._id, periodo.plan!.version_actual),
          },
        ]
      : []),
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    radicar.reset();
    try {
      await radicar.mutateAsync({
        academic_year_id: anioId,
        periodo_numero: periodo.numero,
        subject_id: tarjeta.asignatura._id,
        grade_id: tarjeta.grado._id,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        archivo,
      });
      onClose();
    } catch {
      // El error queda en `radicar.error` y se muestra en el formulario.
    }
  }

  const ultima = periodo.plan?.ultima_revision;

  return (
    <Drawer
      open={open}
      title={respondiendo ? 'Responder a las observaciones' : 'Cargar el plan de aula'}
      subtitle={`${tarjeta.asignatura.nombre} · ${tarjeta.grado.nombre} · ${periodo.nombre}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={respondiendo ? 'Enviar corrección' : 'Radicar plan'}
      isSubmitting={radicar.isPending}
      submitDisabled={!archivo || titulo.trim().length === 0 || descripcion.trim().length === 0}
      size="xl"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {radicar.isError && <Alert tone="error">{errorMessage(radicar.error)}</Alert>}

          {respondiendo && ultima && (
            <Alert tone="warning">
              <p className="font-semibold">Coordinación devolvió tu plan el {formatoFechaHora(ultima.fecha)}:</p>
              <p className="mt-1 whitespace-pre-line">{ultima.comentario}</p>
              <p className="mt-1 text-xs">{nombreDePersona(ultima.revisor)}. Puedes reenviarlo cuantas veces haga falta hasta que lo aprueben.</p>
            </Alert>
          )}

          {periodo.ventana && !respondiendo && (
            <Alert tone={periodo.radicaria_fuera_de_plazo ? 'warning' : 'info'}>
              {periodo.radicaria_fuera_de_plazo ? (
                <p>
                  La fecha límite de este periodo fue el <strong>{formatoFechaCalendario(periodo.ventana.limite)}</strong>. Puedes entregar igualmente, pero el plan
                  quedará marcado <strong>ENTREGADO FUERA DE PLAZO</strong> con la fecha y la hora de hoy.
                </p>
              ) : (
                <p>
                  Entrega del periodo: <strong>{textoVentana(periodo.ventana)}</strong>.
                </p>
              )}
            </Alert>
          )}

          <CamposRadicacion
            titulo={titulo}
            onTitulo={setTitulo}
            descripcion={descripcion}
            onDescripcion={setDescripcion}
            archivo={archivo}
            onArchivo={setArchivo}
            disabled={radicar.isPending}
          />
        </div>

        <PanelDocumentosPdf
          documentos={documentos}
          vacio="Aún no hay un plan de área aprobado ni documentos de apoyo para este grado."
        />
      </div>
    </Drawer>
  );
}
