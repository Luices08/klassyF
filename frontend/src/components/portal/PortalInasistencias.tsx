import { useState } from 'react';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useInasistenciasDelHijo } from '../../hooks/usePortal';
import { formatoFechaCalendario } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoAsistenciaChip, EstadoJustificacionBadge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor: number }) => (
  <div>
    <p className="text-label uppercase tracking-wide text-muted">{etiqueta}</p>
    <p className="text-h2 text-ink">{valor}</p>
  </div>
);

/** Las fallas del estudiante elegido (lo que se puede justificar) y el estado de su excusa si ya hay una. */
export function PortalInasistencias({ studentId }: { studentId: string }) {
  const { anio } = useAnioDeTrabajo();
  const [periodo, setPeriodo] = useState<number | undefined>(undefined);
  const { data, isLoading, isError, error } = useInasistenciasDelHijo(studentId, periodo);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Select label="Periodo" value={periodo ?? ''} onChange={(e) => setPeriodo(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Todo el año</option>
            {anio?.periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre}
              </option>
            ))}
          </Select>
          {data && (
            <>
              <Dato etiqueta="Inasistencias" valor={data.resumen.total} />
              <Dato etiqueta="Justificadas" valor={data.resumen.justificadas} />
              <Dato etiqueta="Sin justificar" valor={data.resumen.injustificadas} />
            </>
          )}
        </div>
      </Card>

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {data && (
        <Table>
          <TableHead>
            <Th>Fecha</Th>
            <Th>Asignatura</Th>
            <Th>Estado</Th>
            <Th>Novedad</Th>
            <Th>Excusa</Th>
          </TableHead>
          <TableBody>
            {data.data.map((f) => (
              <tr key={f.registro_id}>
                <Td>{formatoFechaCalendario(f.fecha)}</Td>
                <Td>{f.asignatura}</Td>
                <Td>
                  <EstadoAsistenciaChip nombre={f.estado.nombre} tono={f.estado.tono} />
                </Td>
                <Td>{f.novedad || '—'}</Td>
                <Td>{f.justificacion ? <EstadoJustificacionBadge value={f.justificacion.estado} /> : '—'}</Td>
              </tr>
            ))}
            {data.data.length === 0 && <EmptyRow colSpan={5}>No hay inasistencias registradas.</EmptyRow>}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted">Para justificar una inasistencia comunícate con la secretaría o con el docente de la clase.</p>
    </div>
  );
}
