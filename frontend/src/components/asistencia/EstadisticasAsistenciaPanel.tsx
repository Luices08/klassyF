import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useEstadisticasAsistencia } from '../../hooks/useAsistencia';
import { useGroups } from '../../hooks/useGroups';
import type { AcademicYear, DimensionEstadistica } from '../../types/domain';

const DIMENSIONES: Array<{ valor: DimensionEstadistica; etiqueta: string }> = [
  { valor: 'estudiante', etiqueta: 'Por estudiante' },
  { valor: 'grupo', etiqueta: 'Por grupo' },
  { valor: 'asignatura', etiqueta: 'Por asignatura' },
  { valor: 'periodo', etiqueta: 'Por periodo' },
];

function Resumen({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <Card>
      <div className="p-4">
        <span className="text-xs font-medium uppercase text-muted">{titulo}</span>
        <p className="mt-1 text-h3 text-ink">{valor}</p>
      </div>
    </Card>
  );
}

/** Motor de estadísticas de ausentismo: consolidado por estudiante, grupo, asignatura o periodo. */
export function EstadisticasAsistenciaPanel({ anio }: { anio: AcademicYear }) {
  const [agruparPor, setAgruparPor] = useState<DimensionEstadistica>('grupo');
  const [periodo, setPeriodo] = useState('');
  const [groupId, setGroupId] = useState('');

  const { data: grupos = [] } = useGroups({ academic_year_id: anio._id });
  const { data, isLoading, isError, error } = useEstadisticasAsistencia({
    academic_year_id: anio._id,
    agrupar_por: agruparPor,
    periodo_numero: periodo ? Number(periodo) : undefined,
    group_id: groupId || undefined,
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <Select label="Agrupar" value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as DimensionEstadistica)}>
            {DIMENSIONES.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.etiqueta}
              </option>
            ))}
          </Select>
          <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="">Todos</option>
            {anio.periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <Select label="Grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g._id} value={g._id}>
                {`${typeof g.grade_id === 'object' ? g.grade_id.nombre : ''} ${g.nomenclatura}`.trim()}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Resumen titulo="Registros" valor={data.total.total_registros} />
          <Resumen titulo="Fallas" valor={data.total.fallas} />
          <Resumen titulo="Retardos" valor={data.total.retardos} />
          <Resumen titulo="Ausentismo" valor={`${data.total.porcentaje_ausentismo}%`} />
        </div>
      )}

      <Card>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <Th>{DIMENSIONES.find((d) => d.valor === agruparPor)?.etiqueta.replace('Por ', '')}</Th>
              <Th className="text-right">Registros</Th>
              <Th className="text-right">Asistencias</Th>
              <Th className="text-right">Retardos</Th>
              <Th className="text-right">Fallas</Th>
              <Th className="text-right">Justificadas</Th>
              <Th className="text-right">Injustificadas</Th>
              <Th className="text-right">% ausentismo</Th>
            </TableHead>
            <TableBody>
              {!data || data.filas.length === 0 ? (
                <EmptyRow colSpan={8}>Todavía no hay asistencia registrada con estos filtros.</EmptyRow>
              ) : (
                data.filas.map((f) => (
                  <tr key={f.clave} className="hover:bg-soft/40">
                    <Td className="font-medium text-ink">{f.etiqueta}</Td>
                    <Td className="text-right">{f.total_registros}</Td>
                    <Td className="text-right">{f.asistencias}</Td>
                    <Td className="text-right">{f.retardos}</Td>
                    <Td className="text-right font-semibold text-ink">{f.fallas}</Td>
                    <Td className="text-right">{f.fallas_justificadas}</Td>
                    <Td className="text-right">{f.fallas_injustificadas}</Td>
                    <Td className="text-right font-semibold text-ink">{f.porcentaje_ausentismo}%</Td>
                  </tr>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
