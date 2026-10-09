import { useState } from 'react';
import { ConfiguracionActividadesCard } from '../../components/actividades/ConfiguracionActividadesCard';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { TipoActividadChip } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { useActividades } from '../../hooks/useActividades';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGroups } from '../../hooks/useGroups';
import { TIPOS_ACTIVIDAD, NOMBRES_TIPO_ACTIVIDAD, type TipoActividad, formatoInstante } from '../../lib/actividades';

/**
 * Supervisión de coordinación: lo que cada grupo tiene programado, de todos sus docentes, para vigilar la carga. No
 * califica ni edita (eso es del docente titular); sí fija desde cuántas actividades por día se advierte.
 */
export function ActividadesGestionPage() {
  const { anio } = useAnioDeTrabajo();
  const grupos = useGroups({ academic_year_id: anio?._id });
  const [grupoId, setGrupoId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [tipo, setTipo] = useState<TipoActividad | ''>('');

  const lista = useActividades(
    { academic_year_id: anio?._id, group_id: grupoId, periodo: periodo ? Number(periodo) : undefined, tipo: tipo || undefined },
    Boolean(anio && grupoId)
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Actividades por grupo" subtitle="Qué tiene programado cada grupo y cuánto le exigen sus docentes." />

      <ConfiguracionActividadesCard puedeEditar />

      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <Select label="Grupo" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Selecciona un grupo…</option>
            {(grupos.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {typeof g.grade_id === 'object' ? `${g.grade_id.nombre} · ` : ''}
                {g.nomenclatura}
              </option>
            ))}
          </Select>
          <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="">Todos</option>
            {(anio?.periodos ?? []).map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>
          <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoActividad | '')}>
            <option value="">Todos</option>
            {TIPOS_ACTIVIDAD.map((t) => (
              <option key={t} value={t}>
                {NOMBRES_TIPO_ACTIVIDAD[t]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!grupoId && <Alert tone="info">Selecciona un grupo para ver sus actividades.</Alert>}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      {lista.isLoading && grupoId && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}

      {grupoId && lista.data && (
        <Table>
          <TableHead>
            <Th>Límite de entrega</Th>
            <Th>Actividad</Th>
            <Th>Asignatura y docente</Th>
            <Th>Entregas</Th>
          </TableHead>
          <TableBody>
            {lista.data.length === 0 && <EmptyRow colSpan={4}>Este grupo no tiene actividades con esos filtros.</EmptyRow>}
            {lista.data.map((a) => (
              <tr key={a._id}>
                <Td>{formatoInstante(a.fecha_entrega)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.titulo}</span>
                    <TipoActividadChip value={a.tipo} />
                  </div>
                  <p className="text-xs text-muted">Periodo {a.periodo_numero}</p>
                </Td>
                <Td>
                  <p>{a.asignacion?.asignatura?.nombre ?? '—'}</p>
                  <p className="text-xs text-muted">{a.asignacion?.docente ? `${a.asignacion.docente.nombre} ${a.asignacion.docente.apellido}` : ''}</p>
                </Td>
                <Td>
                  {a.requiere_entrega ? `${a.resumen.entregadas}/${a.resumen.estudiantes} entregaron` : 'Actividad de aula'}
                  <p className="text-xs text-muted">{a.resumen.calificadas} calificadas</p>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
