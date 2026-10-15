import { type FormEvent, useState } from 'react';
import { formatoFechaHora } from '../../lib/fechas';
import { nombreDePersona } from '../../lib/planeacion';
import { cargarArchivoDocumento, useDocumentosReferencia } from '../../hooks/useDocumentosReferencia';
import { cargarArchivoPlanArea, useRadicarPlanArea } from '../../hooks/usePlanesArea';
import type { FilaPlanArea } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { type DocumentoPanelPdf, PanelDocumentosPdf } from '../ui/PanelDocumentosPdf';
import { CamposRadicacion } from './CamposRadicacion';

interface PlanAreaDrawerProps {
  open: boolean;
  onClose: () => void;
  anioId: string;
  fila: FilaPlanArea;
}

/**
 * El líder del área carga su plan de área anual (o responde a lo que coordinación devolvió). Al lado, los PDF de apoyo que coordinación
 * asignó a esa área (DBA, estándares, lineamientos) para consultarlos mientras lo arma.
 */
export function PlanAreaDrawer({ open, onClose, anioId, fila }: PlanAreaDrawerProps) {
  const respondiendo = fila.estado === 'DEVUELTO' && fila.plan !== null;
  const [titulo, setTitulo] = useState(fila.plan?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(fila.plan?.descripcion ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const radicar = useRadicarPlanArea();
  const apoyo = useDocumentosReferencia({ area_id: fila.area._id }, open);

  const documentos: DocumentoPanelPdf[] = [
    ...(apoyo.data ?? []).map((d) => ({
      clave: `apoyo-${d._id}`,
      titulo: `${d.titulo} · ${d.grados.map((g) => g.nombre).join(', ')}`,
      grupo: 'Documentos de apoyo del área',
      nombreArchivo: d.archivo.nombre,
      cargar: () => cargarArchivoDocumento(d._id),
    })),
    ...(fila.plan
      ? [
          {
            clave: `mi-plan-${fila.plan._id}-${fila.plan.version_actual}`,
            titulo: `Tu último envío (versión ${fila.plan.version_actual})`,
            grupo: 'Tu plan',
            nombreArchivo: fila.plan.archivo_nombre,
            cargar: () => cargarArchivoPlanArea(fila.plan!._id, fila.plan!.version_actual),
          },
        ]
      : []),
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!archivo || !fila.lider_area_id) return;
    radicar.reset();
    try {
      await radicar.mutateAsync({ academic_year_id: anioId, lider_area_id: fila.lider_area_id, titulo: titulo.trim(), descripcion: descripcion.trim(), archivo });
      onClose();
    } catch {
      // El error queda en `radicar.error` y se muestra en el formulario.
    }
  }

  const ultima = fila.plan?.ultima_revision;

  return (
    <Drawer
      open={open}
      title={respondiendo ? 'Responder a las observaciones' : 'Cargar el plan de área'}
      subtitle={`${fila.area.nombre} · plan anual${fila.alcance ? ` · ${fila.alcance.texto}` : ''}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={respondiendo ? 'Enviar corrección' : 'Enviar a revisión'}
      isSubmitting={radicar.isPending}
      submitDisabled={!archivo || titulo.trim().length === 0 || descripcion.trim().length === 0}
      size="xl"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {radicar.isError && <Alert tone="error">{errorMessage(radicar.error)}</Alert>}

          {respondiendo && ultima && (
            <Alert tone="warning">
              <p className="font-semibold">
                {ultima.accion === 'REABIERTO' ? 'Un administrador reabrió tu plan' : 'Coordinación devolvió tu plan'} el {formatoFechaHora(ultima.fecha)}:
              </p>
              <p className="mt-1 whitespace-pre-line">{ultima.comentario}</p>
              <p className="mt-1 text-xs">{nombreDePersona(ultima.revisor)}. Puedes reenviarlo hasta que lo aprueben.</p>
            </Alert>
          )}
          {!respondiendo && (
            <Alert tone="info">
              {fila.alcance ? `Este plan cubre: ${fila.alcance.texto}. ` : ''}Al aprobarlo, coordinación lo da por válido para todo el año lectivo. Mientras no esté
              aprobado, los demás docentes de esa parte del área no pueden cargar su plan de aula.
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

        <PanelDocumentosPdf documentos={documentos} vacio="Coordinación aún no ha cargado documentos de apoyo para esta área." />
      </div>
    </Drawer>
  );
}
