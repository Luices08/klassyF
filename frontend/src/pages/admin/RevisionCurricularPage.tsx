import { useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoDesarrolloCurricularBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, EyeIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import {
  useCurricularDevelopments,
  useReabrirCurricular,
  useRevisarCurricular,
} from '../../hooks/useCurricularDevelopments';
import { useAuth } from '../../context/AuthContext';
import { formatoFechaHora } from '../../lib/fechas';
import type { CurricularDevelopment, DbaReferente, EstadoDesarrolloCurricular } from '../../types/domain';

export function RevisionCurricularPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';

  // Acotado al año de trabajo (vigencia activa, o el más reciente sin cerrar): mismo criterio
  // que el resto del sistema (useAnioDeTrabajo), no "todos los años mezclados".
  const { anio: anioTrabajo } = useAnioDeTrabajo();
  const periodosDelAnio = anioTrabajo?.periodos ?? [];

  const [filtroEstado, setFiltroEstado] = useState<string>('ENVIADO_REVISION');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('');

  const { data: desarrollos = [], isLoading } = useCurricularDevelopments({
    academic_year_id: anioTrabajo?._id,
    estado: (filtroEstado as EstadoDesarrolloCurricular) || undefined,
    periodo_numero: filtroPeriodo ? Number(filtroPeriodo) : undefined,
  });

  const [desarrolloSeleccionado, setDesarrolloSeleccionado] = useState<CurricularDevelopment | null>(null);
  const [observacion, setObservacion] = useState<string>('');
  const [motivoReapertura, setMotivoReapertura] = useState<string>('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const revisarMutation = useRevisarCurricular();
  const reabrirMutation = useReabrirCurricular();

  const handleOpenReview = (dev: CurricularDevelopment) => {
    setDesarrolloSeleccionado(dev);
    setObservacion('');
    setMotivoReapertura('');
    setReviewError(null);
  };

  const handleDecision = async (decision: 'APROBADO' | 'DEVUELTO_OBSERVACIONES') => {
    if (!desarrolloSeleccionado) return;
    setReviewError(null);

    if (decision === 'DEVUELTO_OBSERVACIONES' && !observacion.trim()) {
      setReviewError('Debe ingresar las observaciones pedagógicas para que el docente pueda realizar las correcciones.');
      return;
    }
    if (decision === 'APROBADO') {
      const confirmado = window.confirm(
        'Una vez aprobada, la planeación solo puede corregirse si un administrador la reabre con un motivo. ¿Aprobar de todas formas?'
      );
      if (!confirmado) return;
    }

    try {
      await revisarMutation.mutateAsync({
        id: desarrolloSeleccionado._id,
        decision,
        observacion: observacion.trim() || undefined,
      });
      setDesarrolloSeleccionado(null);
    } catch (err) {
      setReviewError(errorMessage(err));
    }
  };

  const handleReabrir = async () => {
    if (!desarrolloSeleccionado) return;
    setReviewError(null);

    if (!motivoReapertura.trim()) {
      setReviewError('Debe ingresar el motivo de la reapertura.');
      return;
    }

    try {
      await reabrirMutation.mutateAsync({ id: desarrolloSeleccionado._id, motivo: motivoReapertura.trim() });
      setDesarrolloSeleccionado(null);
    } catch (err) {
      setReviewError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revisión y Aprobación Curricular"
        subtitle={`Supervisión pedagógica de planeaciones docentes del año lectivo ${anioTrabajo?.year ?? '—'}, control de DBA del MEN y concepto evaluativo.`}
      />

      {/* Filtros */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <Select
            label="Filtrar por estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="">Todos los estados</option>
            <option value="ENVIADO_REVISION">Pendientes de Revisión (Enviados)</option>
            <option value="APROBADO">Aprobados</option>
            <option value="DEVUELTO_OBSERVACIONES">Devueltos con Observaciones</option>
            <option value="BORRADOR">Borradores en Preparación</option>
          </Select>

          <Select
            label="Periodo académico"
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">Todos los periodos</option>
            {periodosDelAnio.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Tabla de Planeaciones */}
      <Card>
        <CardHeader
          title="Bandeja de Planeaciones Docentes"
          subtitle={`Se encontraron ${desarrollos.length} desarrollos curriculares registrados.`}
        />

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <Th>Docente</Th>
              <Th>Asignatura / Curso</Th>
              <Th>Grupo / Sede</Th>
              <Th className="text-center">Periodo</Th>
              <Th className="text-center">DBA Seleccionados</Th>
              <Th>Estado</Th>
              <Th className="text-center">Versión</Th>
              <Th className="text-right">Acción</Th>
            </TableHead>
            <TableBody>
              {desarrollos.length === 0 ? (
                <EmptyRow colSpan={8}>
                  No hay desarrollos curriculares para revisar con los filtros seleccionados.
                </EmptyRow>
              ) : (
                desarrollos.map((dev) => {
                  const asg = typeof dev.teacher_assignment_id === 'object' ? dev.teacher_assignment_id : null;
                  const doc = asg && typeof asg.docente_id === 'object' ? asg.docente_id : null;
                  const grp = asg && typeof asg.group_id === 'object' ? asg.group_id : null;
                  const sub = asg && typeof asg.subject_id === 'object' ? asg.subject_id : null;
                  const sede = grp && typeof grp.sede_id === 'object' ? grp.sede_id : null;
                  const grado = grp && typeof grp.grade_id === 'object' ? grp.grade_id : null;

                  return (
                    <tr key={dev._id} className="hover:bg-soft/40 transition-colors">
                      <Td className="font-semibold text-ink">
                        {doc ? `${doc.apellido}, ${doc.nombre}` : '—'}
                      </Td>
                      <Td className="text-body font-medium">
                        {sub ? `${sub.nombre} (${sub.abreviatura})` : '—'}
                      </Td>
                      <Td className="text-body text-xs">
                        {grp ? (
                          <span>
                            <strong>Grupo {grp.nomenclatura}</strong>
                            {grado ? ` · ${grado.nombre}` : ''}
                            {sede ? ` · ${sede.nombre}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="text-center font-bold text-ink">Periodo {dev.periodo_numero}</Td>
                      <Td className="text-center font-medium text-body">
                        {dev.dba_seleccionados.length} DBA
                      </Td>
                      <Td>
                        <EstadoDesarrolloCurricularBadge value={dev.estado} />
                      </Td>
                      <Td className="text-center text-xs text-muted">v{dev.version}</Td>
                      <Td className="text-right">
                        <Button
                          variant="outline"
                          onClick={() => handleOpenReview(dev)}
                          className="text-xs py-1 px-2.5"
                        >
                          <EyeIcon className="h-3.5 w-3.5 mr-1" />
                          Revisar
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Drawer: Revisión Detallada de Planeación */}
      <Drawer
        open={Boolean(desarrolloSeleccionado)}
        onClose={() => setDesarrolloSeleccionado(null)}
        title="Revisión de Planeación Pedagógica"
        size="lg"
      >
        {desarrolloSeleccionado && (
          <div className="space-y-4">
            {reviewError && <Alert tone="error">{reviewError}</Alert>}

            {/* Cabecera del desarrollo */}
            <div className="p-3 bg-soft rounded-lg space-y-1 text-sm border border-border">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">
                  Periodo {desarrolloSeleccionado.periodo_numero} · Versión {desarrolloSeleccionado.version}
                </span>
                <EstadoDesarrolloCurricularBadge value={desarrolloSeleccionado.estado} />
              </div>
              <p className="text-xs text-muted">
                {desarrolloSeleccionado.semanas_estimadas} semanas lectivas proyectadas.
              </p>
            </div>

            {/* DBA Seleccionados */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Referentes del MEN Seleccionados ({desarrolloSeleccionado.dba_seleccionados.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {desarrolloSeleccionado.dba_seleccionados.map((d, idx) => {
                  const dba = typeof d === 'object' ? (d as DbaReferente) : null;
                  return (
                    <div key={idx} className="p-2.5 rounded-lg border border-border bg-surface text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary">DBA #{dba?.numero_dba || idx + 1}</span>
                        {dba?.organizador && (
                          <span className="text-[10px] bg-primary-soft text-primary px-1.5 py-0.5 rounded-full">
                            {dba.organizador}
                          </span>
                        )}
                      </div>
                      <p className="text-body">{dba ? dba.enunciado : String(d)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contenidos y Competencias */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Contenidos Temáticos</h4>
              <ul className="list-disc pl-5 text-sm text-body space-y-0.5">
                {desarrolloSeleccionado.contenidos_tematicos.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Competencias a Desarrollar</h4>
              <p className="text-sm text-body bg-soft/50 p-2.5 rounded-lg border border-border">
                {desarrolloSeleccionado.competencias}
              </p>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Metodología y Recursos</h4>
              <p className="text-sm text-body bg-soft/50 p-2.5 rounded-lg border border-border">
                {desarrolloSeleccionado.metodologia_y_recursos}
              </p>
            </div>

            {desarrolloSeleccionado.actividades_propuestas && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Actividades de Aprendizaje</h4>
                <p className="text-sm text-body bg-soft/50 p-2.5 rounded-lg border border-border">
                  {desarrolloSeleccionado.actividades_propuestas}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Criterios de Evaluación</h4>
              <p className="text-sm text-body bg-soft/50 p-2.5 rounded-lg border border-border">
                {desarrolloSeleccionado.criterios_evaluacion}
              </p>
            </div>

            {/* Historial de revisiones previas */}
            {desarrolloSeleccionado.historial_revisiones.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Historial de Revisiones</h4>
                <div className="space-y-2">
                  {desarrolloSeleccionado.historial_revisiones.map((rev, idx) => {
                    const coord = typeof rev.coordinador_id === 'object' ? rev.coordinador_id : null;
                    return (
                      <div key={idx} className="p-2 rounded-lg bg-soft text-xs space-y-0.5 border border-border">
                        <div className="flex justify-between font-semibold text-ink">
                          <span>{coord ? `${coord.nombre} ${coord.apellido}` : 'Coordinador'}</span>
                          <span>{formatoFechaHora(rev.fecha)}</span>
                        </div>
                        <p className="text-body italic">"{rev.observacion || 'Sin comentario'}"</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Área de Concepto y Decisión: solo tiene sentido mientras está pendiente de revisión */}
            {desarrolloSeleccionado.estado === 'ENVIADO_REVISION' && (
              <div className="pt-4 border-t border-border space-y-3">
                <Textarea
                  label="Observaciones Pedagógicas del Coordinador"
                  rows={3}
                  placeholder="Retroalimentación, observaciones o justificación para el docente..."
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => setDesarrolloSeleccionado(null)}
                    disabled={revisarMutation.isPending}
                  >
                    Cerrar
                  </Button>

                  <Button
                    variant="soft-danger"
                    onClick={() => handleDecision('DEVUELTO_OBSERVACIONES')}
                    disabled={revisarMutation.isPending}
                  >
                    Devolver con Observaciones
                  </Button>

                  <Button
                    variant="primary"
                    onClick={() => handleDecision('APROBADO')}
                    disabled={revisarMutation.isPending}
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-1.5" />
                    Aprobar Planeación
                  </Button>
                </div>
              </div>
            )}

            {/* Reapertura de una ya aprobada: solo ADMIN, con motivo obligatorio (igual que
                reabrir un periodo CERRADO en M05) — vuelve a DEVUELTO_OBSERVACIONES. */}
            {desarrolloSeleccionado.estado === 'APROBADO' && esAdmin && (
              <div className="pt-4 border-t border-border space-y-3">
                <Alert tone="warning">
                  Esta planeación ya fue aprobada. Reabrirla la devuelve al docente con observaciones para que la
                  corrija; el docente deberá volver a enviarla a revisión.
                </Alert>
                <Textarea
                  label="Motivo de la reapertura"
                  rows={2}
                  placeholder="Por qué se reabre esta planeación ya aprobada..."
                  value={motivoReapertura}
                  onChange={(e) => setMotivoReapertura(e.target.value)}
                  required
                />
                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => setDesarrolloSeleccionado(null)}
                    disabled={reabrirMutation.isPending}
                  >
                    Cerrar
                  </Button>
                  <Button
                    variant="soft-danger"
                    onClick={handleReabrir}
                    disabled={reabrirMutation.isPending || !motivoReapertura.trim()}
                  >
                    Reabrir Planeación
                  </Button>
                </div>
              </div>
            )}

            {desarrolloSeleccionado.estado !== 'ENVIADO_REVISION' && desarrolloSeleccionado.estado !== 'APROBADO' && (
              <div className="pt-4 border-t border-border flex justify-end">
                <Button variant="secondary" onClick={() => setDesarrolloSeleccionado(null)}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
