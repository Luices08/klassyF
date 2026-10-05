import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import {
  CATEGORIAS_AJUSTE,
  EFECTIVIDAD_AJUSTE,
  TIPOS_BARRERA,
  nombreDe,
  useAjustes,
  useGuardarAjuste,
  useRegistrarSeguimiento,
  type EfectividadAjuste,
  type Expediente,
  type FilaAjuste,
} from '../../hooks/useInclusion';
import { useReferentes } from '../../hooks/useReferentesCurriculares';
import type { DbaReferente } from '../../types/domain';
import {} from './campos';
import { formatoFechaLocal } from '../../lib/fechas';

/**
 * Anexo 2: una fila por asignatura del plan de estudios del grupo. Cada docente diligencia solo la suya (el servidor lo
 * comprueba con su asignación); orientación puede apoyar. Los objetivos se eligen del banco curricular (DBA), no se escriben.
 */
export function AjustesPanel({ exp }: { exp: Expediente }) {
  const ajustes = useAjustes(exp._id);
  const [editando, setEditando] = useState<FilaAjuste | null>(null);
  const [evaluando, setEvaluando] = useState<FilaAjuste | null>(null);

  if (ajustes.isLoading) return <Spinner />;
  if (ajustes.isError) return <Alert tone="error">{errorMessage(ajustes.error)}</Alert>;
  if (!ajustes.data) return null;
  const { filas, grade_id, seguimientos_minimos } = ajustes.data;
  const activo = exp.estado === 'ACTIVO';

  return (
    <div className="space-y-3">
      {exp.estado === 'BORRADOR' && <Alert tone="info">Los docentes podrán diligenciar sus ajustes cuando orientación inicie la construcción del expediente.</Alert>}
      {filas.length === 0 && <Alert tone="warning">No hay asignaturas para mostrar: el plan de estudios del grupo no tiene asignaturas, o ninguna es tuya.</Alert>}
      <Table>
        <TableHead>
          <tr>
            <Th>Área / asignatura</Th>
            <Th>Docente</Th>
            <Th>Ajuste</Th>
            <Th>Seguimientos</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {filas.map((f) => {
            const hechos = f.ajuste?.seguimientos.length ?? 0;
            return (
              <tr key={f.subject_id}>
                <Td>
                  {f.asignatura}
                  <span className="block text-xs text-muted">{f.area}</span>
                </Td>
                <Td>{f.docente ?? <Chip tone="red">Sin docente</Chip>}</Td>
                <Td>{f.ajuste?.completo ? <Chip tone="green">Completo</Chip> : <Chip tone="orange">{f.ajuste ? 'Incompleto' : 'Pendiente'}</Chip>}</Td>
                <Td>
                  {activo || hechos > 0 ? (
                    <Chip tone={hechos >= seguimientos_minimos ? 'green' : 'neutral'}>
                      {hechos} de {seguimientos_minimos}
                    </Chip>
                  ) : (
                    <span className="text-xs text-muted">Desde que el acta esté firmada</span>
                  )}
                </Td>
                <Td className="space-x-2 text-right">
                  <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setEditando(f)}>
                    {f.puede_editar && exp.editable ? 'Diligenciar' : 'Ver'}
                  </Button>
                  {activo && f.puede_editar && exp.editable && f.ajuste && (
                    <Button variant="soft-success" className="px-3 py-1 text-xs" onClick={() => setEvaluando(f)}>
                      Seguimiento
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
          {filas.length === 0 && <EmptyRow colSpan={5}>Sin asignaturas.</EmptyRow>}
        </TableBody>
      </Table>
      {editando && <AjusteDrawer exp={exp} fila={editando} gradeId={grade_id} onClose={() => setEditando(null)} />}
      {evaluando && <SeguimientoDrawer exp={exp} fila={evaluando} onClose={() => setEvaluando(null)} />}
    </div>
  );
}

function AjusteDrawer({ exp, fila, gradeId, onClose }: { exp: Expediente; fila: FilaAjuste; gradeId: string; onClose: () => void }) {
  const guardar = useGuardarAjuste(exp._id);
  const soloLectura = !fila.puede_editar || !exp.editable;
  const a = fila.ajuste;
  const [form, setForm] = useState({
    dba_ids: a?.dba_ids ?? [],
    objetivo_flexibilizado: a?.objetivo_flexibilizado ?? '',
    barrera_asignatura: a?.barrera_asignatura ?? '',
    tipos_barrera: a?.tipos_barrera ?? [],
    ajuste_metodologico: a?.ajuste_metodologico ?? '',
    ajuste_evaluativo: a?.ajuste_evaluativo ?? '',
    categorias_ajuste: a?.categorias_ajuste ?? [],
    recursos: a?.recursos ?? '',
  });
  const referentes = useReferentes({ grade_id: gradeId, area_id: fila.area_id, tipo_referente: 'DBA' });
  const dbas = (referentes.data ?? []) as DbaReferente[];

  const alternar = (campo: 'dba_ids' | 'tipos_barrera' | 'categorias_ajuste', valor: string) =>
    setForm((f) => ({ ...f, [campo]: f[campo].includes(valor) ? f[campo].filter((x) => x !== valor) : [...f[campo], valor] }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ subject_id: fila.subject_id, ...form });
    onClose();
  };

  return (
    <Drawer open size="lg" title={fila.asignatura} subtitle={`${fila.area} · ${fila.docente ?? 'Sin docente asignado'}`} onClose={onClose} onSubmit={soloLectura ? undefined : enviar} submitLabel="Guardar ajuste" isSubmitting={guardar.isPending}>
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {exp.estado === 'ACTIVO' && !soloLectura && <Alert tone="info">El acta ya está firmada: guardar un cambio crea una nueva versión del expediente y exige emitir de nuevo los documentos.</Alert>}

      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Objetivos del grado (DBA)</p>
        {referentes.isLoading && <Spinner />}
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {dbas.map((d) => (
            <li key={d._id}>
              <label className="flex items-start gap-2 text-sm text-body">
                <input type="checkbox" disabled={soloLectura} checked={form.dba_ids.includes(d._id)} onChange={() => alternar('dba_ids', d._id)} className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span>
                  <span className="font-semibold">DBA {d.numero_dba}.</span> {d.enunciado}
                </span>
              </label>
            </li>
          ))}
          {!referentes.isLoading && dbas.length === 0 && <li className="text-sm text-muted">El banco no tiene DBA para este grado y área; describe el objetivo abajo.</li>}
        </ul>
      </div>
      <Textarea label="Objetivo o propósito flexibilizado" disabled={soloLectura} value={form.objetivo_flexibilizado} onChange={(e) => setForm((f) => ({ ...f, objetivo_flexibilizado: e.target.value }))} maxLength={4000} hint="Los mismos objetivos del grado, con las oportunidades de acceso que el estudiante necesita." />

      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Tipo de barrera</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TIPOS_BARRERA.map((t) => (
            <label key={t.codigo} className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" disabled={soloLectura} checked={form.tipos_barrera.includes(t.codigo)} onChange={() => alternar('tipos_barrera', t.codigo)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              {t.nombre}
            </label>
          ))}
        </div>
      </div>
      <Textarea label="Barreras que se evidencian en tu asignatura" disabled={soloLectura} value={form.barrera_asignatura} onChange={(e) => setForm((f) => ({ ...f, barrera_asignatura: e.target.value }))} maxLength={4000} hint="Las barreras están en el contexto, no en el estudiante: qué de tu clase le impide participar o aprender." />
      <Textarea label="Ajuste metodológico (apoyos y estrategias)" disabled={soloLectura} value={form.ajuste_metodologico} onChange={(e) => setForm((f) => ({ ...f, ajuste_metodologico: e.target.value }))} maxLength={4000} />
      <Textarea label="Ajuste evaluativo" disabled={soloLectura} value={form.ajuste_evaluativo} onChange={(e) => setForm((f) => ({ ...f, ajuste_evaluativo: e.target.value }))} maxLength={4000} hint="Cómo evaluarás para las calificaciones del periodo." />

      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Clase de ajuste</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {CATEGORIAS_AJUSTE.map((c) => (
            <label key={c.codigo} className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" disabled={soloLectura} checked={form.categorias_ajuste.includes(c.codigo)} onChange={() => alternar('categorias_ajuste', c.codigo)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              {c.nombre}
            </label>
          ))}
        </div>
      </div>
      <Textarea label="Recursos necesarios (opcional)" disabled={soloLectura} value={form.recursos} onChange={(e) => setForm((f) => ({ ...f, recursos: e.target.value }))} maxLength={4000} />

      {(a?.seguimientos.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-ink">Seguimientos registrados</p>
          <ul className="space-y-1 text-sm text-body">
            {a?.seguimientos.map((s) => (
              <li key={s._id} className="rounded-lg bg-soft p-2">
                <span className="font-semibold">
                  Periodo {s.periodo_numero} · {nombreDe(EFECTIVIDAD_AJUSTE, s.efectividad)}
                </span>
                <span className="block text-xs text-muted">{formatoFechaLocal(s.fecha)}</span>
                {s.observacion && <span className="block">{s.observacion}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

function SeguimientoDrawer({ exp, fila, onClose }: { exp: Expediente; fila: FilaAjuste; onClose: () => void }) {
  const registrar = useRegistrarSeguimiento(exp._id);
  const [periodo, setPeriodo] = useState('1');
  const [efectividad, setEfectividad] = useState<EfectividadAjuste>('PARCIALMENTE_EFECTIVO');
  const [observacion, setObservacion] = useState('');
  const [nuevaAccion, setNuevaAccion] = useState('');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await registrar.mutateAsync({ subject_id: fila.subject_id, periodo_numero: Number(periodo), efectividad, observacion, nueva_accion: nuevaAccion });
    onClose();
  };

  return (
    <Drawer open title="Seguimiento del ajuste" subtitle={fila.asignatura} onClose={onClose} onSubmit={enviar} submitLabel="Registrar seguimiento" isSubmitting={registrar.isPending}>
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}
      <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            Periodo {n}
          </option>
        ))}
      </Select>
      <Select label="¿Qué tan efectivo fue el ajuste?" value={efectividad} onChange={(e) => setEfectividad(e.target.value as EfectividadAjuste)}>
        {EFECTIVIDAD_AJUSTE.map((x) => (
          <option key={x.codigo} value={x.codigo}>
            {x.nombre}
          </option>
        ))}
      </Select>
      <Textarea label="Observaciones del avance" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} />
      <Textarea label="Nueva acción propuesta (opcional)" value={nuevaAccion} onChange={(e) => setNuevaAccion(e.target.value)} maxLength={500} />
    </Drawer>
  );
}
