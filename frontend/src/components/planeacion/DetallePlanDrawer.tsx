import { useState } from 'react';
import { formatoFechaHora, formatoFechaCalendario } from '../../lib/fechas';
import { MAX_COMENTARIO_REVISION, nombreDePersona } from '../../lib/planeacion';
import { cargarArchivoPlanArea, usePlanArea, useReabrirPlanArea, useRevisarPlanArea } from '../../hooks/usePlanesArea';
import { cargarArchivoPlanAula, usePlanAula, useReabrirPlanAula, useRevisarPlanAula } from '../../hooks/usePlanesAula';
import type { DetallePlanArea, DetallePlanAula } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoPlanBadge, FueraDePlazoChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';
import { HistorialPlan } from './HistorialPlan';

function subtituloDe(tipo: 'AREA' | 'AULA', detalle: DetallePlanArea | DetallePlanAula | undefined): string | undefined {
  if (!detalle) return undefined;
  if (tipo === 'AREA') {
    const plan = detalle as DetallePlanArea;
    return `${plan.area.nombre} · ${plan.alcance.texto} · año ${plan.anio ?? '—'}`;
  }
  const plan = detalle as DetallePlanAula;
  return `${plan.asignatura?.nombre ?? ''} · ${plan.grado?.nombre ?? ''} · periodo ${plan.periodo_numero} · ${nombreDePersona(plan.docente)}`;
}

interface DetallePlanDrawerProps {
  tipo: 'AREA' | 'AULA';
  /** null = cerrado. */
  id: string | null;
  onClose: () => void;
}

/**
 * El plan con su PDF al lado, su historial (envíos y comentarios de coordinación con fecha y hora) y, según lo que el servidor
 * diga que se puede (`puede`), la decisión de coordinación: aprobar, devolver con comentario o, solo el ADMIN, reabrir.
 * El docente lo abre solo para leerlo; coordinación y administración, para decidir.
 */
export function DetallePlanDrawer({ tipo, id, onClose }: DetallePlanDrawerProps) {
  const area = usePlanArea(tipo === 'AREA' ? (id ?? undefined) : undefined);
  const aula = usePlanAula(tipo === 'AULA' ? (id ?? undefined) : undefined);
  const consulta = tipo === 'AREA' ? area : aula;
  const detalle: DetallePlanArea | DetallePlanAula | undefined = tipo === 'AREA' ? area.data : aula.data;

  const revisarArea = useRevisarPlanArea();
  const revisarAula = useRevisarPlanAula();
  const reabrirArea = useReabrirPlanArea();
  const reabrirAula = useReabrirPlanAula();
  const revisar = tipo === 'AREA' ? revisarArea : revisarAula;
  const reabrir = tipo === 'AREA' ? reabrirArea : reabrirAula;

  const [versionVista, setVersionVista] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [motivo, setMotivo] = useState('');

  const version = versionVista ?? detalle?.version_actual ?? 1;
  const radicacion = detalle && 'radicacion' in detalle ? detalle.radicacion : null;
  const titulo = tipo === 'AREA' ? 'Plan de área' : 'Plan de aula';
  const subtitulo = subtituloDe(tipo, detalle);

  async function decidir(decision: 'APROBADO' | 'DEVUELTO') {
    if (!id) return;
    revisar.reset();
    await revisar.mutateAsync({ id, decision, comentario: comentario.trim() || undefined });
    setComentario('');
    cerrar();
  }

  async function reabrirPlan() {
    if (!id) return;
    reabrir.reset();
    await reabrir.mutateAsync({ id, motivo: motivo.trim() });
    setMotivo('');
    cerrar();
  }

  function cerrar() {
    setVersionVista(null);
    setComentario('');
    setMotivo('');
    revisar.reset();
    reabrir.reset();
    onClose();
  }

  return (
    <Drawer open={id !== null} title={titulo} subtitle={subtitulo} onClose={cerrar} size="xl">
      {consulta.isLoading && <Spinner label="Cargando el plan..." />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}

      {id && detalle && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <VistaPreviaPdf
              key={`${tipo}-${id}-${version}`}
              claveConsulta={['plan', tipo, id, version]}
              cargar={() => (tipo === 'AREA' ? cargarArchivoPlanArea(id, version) : cargarArchivoPlanAula(id, version))}
              nombreArchivo={detalle.versiones.find((v) => v.numero === version)?.archivo.nombre ?? 'plan.pdf'}
              titulo={`Documento · versión ${version}`}
              altoVisor="h-[70vh]"
            />
          </div>

          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <EstadoPlanBadge value={detalle.estado} />
                {radicacion?.fuera_de_plazo && <FueraDePlazoChip fecha={radicacion.fecha} />}
                {'archivado' in detalle && detalle.archivado && <Chip tone="neutral">Archivado: el docente ya no dicta esta asignatura</Chip>}
                {detalle.origen === 'ADOPTADA' && <Chip tone="green">Adoptado de {nombreDePersona(detalle.adoptado_de?.docente)}</Chip>}
              </div>
              <h3 className="mt-3 text-h3 text-ink">{detalle.titulo}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-body">{detalle.descripcion}</p>
              {radicacion && (
                <p className="mt-3 text-xs text-muted">
                  Radicado por primera vez el {formatoFechaHora(radicacion.fecha)}
                  {radicacion.fecha_limite ? ` · fecha límite ${formatoFechaCalendario(radicacion.fecha_limite)}` : ''}.
                </p>
              )}
            </Card>

            {detalle.puede.revisar && (
              <Card>
                <CardHeader
                  title="Decisión de coordinación"
                  subtitle={tipo === 'AREA' ? 'Aprobarlo vale para todo el año lectivo.' : 'Aprobarlo habilita al docente a programar actividades de este periodo.'}
                />
                {revisar.isError && <Alert tone="error">{errorMessage(revisar.error)}</Alert>}
                <Textarea
                  label="Comentario"
                  rows={3}
                  maxLength={MAX_COMENTARIO_REVISION}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  hint="Obligatorio para devolverlo: es lo que el docente va a corregir. Al aprobar es opcional."
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="soft-success" isLoading={revisar.isPending} onClick={() => void decidir('APROBADO').catch(() => undefined)}>
                    Aprobar
                  </Button>
                  <Button
                    type="button"
                    variant="soft-danger"
                    isLoading={revisar.isPending}
                    disabled={comentario.trim().length === 0}
                    onClick={() => void decidir('DEVUELTO').catch(() => undefined)}
                  >
                    Devolver con comentario
                  </Button>
                </div>
              </Card>
            )}

            {detalle.puede.reabrir && (
              <Card>
                <CardHeader title="Reabrir el plan aprobado" subtitle="Solo un administrador, con motivo. El docente podrá corregirlo de nuevo." />
                {reabrir.isError && <Alert tone="error">{errorMessage(reabrir.error)}</Alert>}
                <Textarea
                  label="Motivo de la reapertura"
                  rows={2}
                  maxLength={MAX_COMENTARIO_REVISION}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <div className="mt-3">
                  <Button type="button" variant="soft-danger" isLoading={reabrir.isPending} disabled={motivo.trim().length === 0} onClick={() => void reabrirPlan().catch(() => undefined)}>
                    Reabrir plan
                  </Button>
                </div>
              </Card>
            )}

            <Card>
              <CardHeader title="Historial" subtitle="Cada envío del docente y cada decisión de coordinación." />
              <HistorialPlan versiones={detalle.versiones} revisiones={detalle.revisiones} versionActiva={version} onVerVersion={setVersionVista} />
            </Card>
          </div>
        </div>
      )}
    </Drawer>
  );
}
