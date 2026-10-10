import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlanillaNotas } from '../../components/notas/PlanillaNotas';
import { ReabrirPlanillaDrawer } from '../../components/notas/ReabrirPlanillaDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckIcon, EyeIcon, RefreshIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGroups } from '../../hooks/useGroups';
import { type FilaSeguimiento, useDeclararDefinitivas, usePlanilla, useReabrirPlanilla, useSeguimientoNotas } from '../../hooks/useNotas';
import { useAuth } from '../../context/AuthContext';

const ESTADO_TONO = { ABIERTA: 'orange', CERRADA: 'blue', DEFINITIVA: 'green' } as const;
const ESTADO_NOMBRE = { ABIERTA: 'Abierta', CERRADA: 'Cerrada por el docente', DEFINITIVA: 'Definitiva' } as const;

/**
 * M12 — seguimiento de coordinación: cómo va la planilla de cada clase en un periodo. Coordinación (o administración)
 * declara DEFINITIVAS las que ya cerró su docente; reabrir una cerrada pide motivo y una definitiva solo la reabre el administrador.
 */
export function NotasGestionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const esAdmin = user?.rol === 'ADMIN';
  const { anio } = useAnioDeTrabajo();
  const grupos = useGroups({ academic_year_id: anio?._id });

  const [grupoId, setGrupoId] = useState('');
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const [viendo, setViendo] = useState<FilaSeguimiento | null>(null);
  const [reabriendo, setReabriendo] = useState<FilaSeguimiento | null>(null);
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error' | 'info'; texto: string } | null>(null);

  const periodos = anio?.periodos ?? [];
  const periodo = periodos.find((p) => p.numero === periodoElegido) ?? periodos[0];
  const seguimiento = useSeguimientoNotas(anio?._id, periodo?.numero, grupoId || undefined);
  const filas = seguimiento.data ?? [];
  const definitivas = useDeclararDefinitivas();
  const reabrir = useReabrirPlanilla();
  const planillaVista = usePlanilla({ teacherAssignmentId: viendo?.teacher_assignment_id, periodoNumero: periodo?.numero });

  async function declarar(fila?: FilaSeguimiento) {
    if (!anio || !periodo) return;
    setMensaje(null);
    try {
      const r = await definitivas.mutateAsync({
        academic_year_id: anio._id,
        periodo_numero: periodo.numero,
        ...(fila ? { teacher_assignment_id: fila.teacher_assignment_id } : grupoId ? { group_id: grupoId } : {}),
      });
      setMensaje({
        tone: r.definitivas > 0 ? 'success' : 'info',
        texto:
          r.definitivas > 0
            ? `${r.definitivas} planilla(s) declaradas definitivas.${r.omitidas.length > 0 ? ` Se omitieron ${r.omitidas.length}: aún no están cerradas por su docente.` : ''}`
            : 'No hubo planillas para declarar definitivas: ninguna está cerrada por su docente todavía.',
      });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  const hayCerradas = filas.some((f) => f.estado === 'CERRADA');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Seguimiento de notas"
        subtitle="Cómo va la planilla de cada clase en el periodo y cuáles ya pueden declararse definitivas."
        action={
          <div className="flex flex-wrap gap-2">
            {esAdmin && (
              <>
                <Button type="button" variant="secondary" onClick={() => navigate('/anio-lectivo')}>
                  Componentes evaluativos
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/admin/plantilla-planilla')}>
                  Plantilla de la planilla
                </Button>
              </>
            )}
            <Button type="button" disabled={!hayCerradas} isLoading={definitivas.isPending} onClick={() => void declarar()}>
              <CheckIcon className="h-4 w-4" />
              Declarar definitivas las cerradas
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <Select label="Periodo" value={periodo?.numero ?? ''} onChange={(e) => setPeriodoElegido(Number(e.target.value))} disabled={periodos.length === 0}>
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>
          <Select label="Grupo" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Todos los grupos</option>
            {(grupos.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {typeof g.grade_id === 'object' ? `${g.grade_id.nombre} · ` : ''}
                {g.nomenclatura}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {seguimiento.isError && <Alert tone="error">{errorMessage(seguimiento.error)}</Alert>}
      {seguimiento.isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}

      {seguimiento.data && (
        <Table>
          <TableHead>
            <Th>Grupo y asignatura</Th>
            <Th>Docente</Th>
            <Th>Avance del cierre</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </TableHead>
          <TableBody>
            {filas.length === 0 && <EmptyRow colSpan={5}>No hay clases para esos filtros.</EmptyRow>}
            {filas.map((f) => (
              <tr key={f.teacher_assignment_id}>
                <Td>
                  <p className="font-semibold text-ink">{f.asignacion?.asignatura?.nombre ?? '—'}</p>
                  <p className="text-xs text-muted">
                    Grupo {f.asignacion?.grupo?.nomenclatura ?? '—'} · {f.actividades} actividad(es)
                  </p>
                </Td>
                <Td>{f.asignacion?.docente ? `${f.asignacion.docente.nombre} ${f.asignacion.docente.apellido}` : '—'}</Td>
                <Td>
                  <div className="min-w-[10rem] space-y-1">
                    <ProgressBar value={f.cerradas + f.definitivas} max={Math.max(f.estudiantes, 1)} tone={f.estado === 'ABIERTA' ? 'orange' : 'green'} label="Avance del cierre" />
                    <p className="text-xs text-muted">
                      {f.cerradas + f.definitivas} de {f.estudiantes} cerradas
                      {f.definitivas > 0 ? ` · ${f.definitivas} definitivas` : ''}
                    </p>
                  </div>
                </Td>
                <Td>
                  <Chip tone={ESTADO_TONO[f.estado]}>{ESTADO_NOMBRE[f.estado]}</Chip>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <IconButton tone="neutral" label="Ver la planilla" icon={<EyeIcon />} onClick={() => setViendo(f)} />
                    <IconButton
                      tone="success"
                      label="Declarar definitiva"
                      icon={<CheckIcon />}
                      disabled={f.estado !== 'CERRADA' || definitivas.isPending}
                      onClick={() => void declarar(f)}
                    />
                    <IconButton
                      tone="danger"
                      label={f.estado === 'DEFINITIVA' && !esAdmin ? 'Solo el administrador reabre una planilla definitiva' : 'Reabrir con motivo'}
                      icon={<RefreshIcon />}
                      disabled={f.estado === 'ABIERTA' || (f.estado === 'DEFINITIVA' && !esAdmin)}
                      onClick={() => setReabriendo(f)}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer
        open={viendo !== null}
        size="xl"
        title={`${viendo?.asignacion?.asignatura?.nombre ?? 'Planilla'} · Grupo ${viendo?.asignacion?.grupo?.nomenclatura ?? ''}`}
        subtitle="Consulta: solo el docente titular digita las notas."
        onClose={() => setViendo(null)}
      >
        {planillaVista.isLoading && <Spinner />}
        {planillaVista.isError && <Alert tone="error">{errorMessage(planillaVista.error)}</Alert>}
        {planillaVista.data && <PlanillaNotas planilla={planillaVista.data} />}
      </Drawer>

      {reabriendo && periodo && (
        <ReabrirPlanillaDrawer
          open
          subtitulo={`${reabriendo.asignacion?.asignatura?.nombre ?? 'Clase'} · Grupo ${reabriendo.asignacion?.grupo?.nomenclatura ?? '—'} · Periodo ${periodo.numero}`}
          aviso={reabriendo.estado === 'DEFINITIVA' ? 'Las notas ya eran definitivas.' : undefined}
          onClose={() => setReabriendo(null)}
          onConfirmar={(motivo) => reabrir.mutateAsync({ teacherAssignmentId: reabriendo.teacher_assignment_id, periodoNumero: periodo.numero, motivo })}
        />
      )}
    </div>
  );
}
