import { useFichaEstudiante } from '../../hooks/useComision';
import { formatoFechaCalendario } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

/**
 * La ficha técnica del estudiante para quien delibera: notas por periodo, recuperaciones, inasistencias, solo conteos de convivencia y
 * si tiene PIAR u orientación (nunca el contenido). Es lo que el servidor deja ver a esa persona; para el resto «no existe».
 */
export function FichaDrawer({ studentId, anioId, nombre, onClose }: { studentId: string; anioId: string; nombre: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useFichaEstudiante(studentId, anioId);
  const periodos = [...new Set((data?.notas_por_periodo ?? []).flatMap((a) => a.periodos.map((p) => p.periodo)))].sort((a, b) => a - b);

  return (
    <Drawer open title="Ficha técnica" subtitle={nombre} onClose={onClose} size="lg">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Chip tone="blue">
              {data.grado} {data.grupo}
            </Chip>
            {data.tiene_piar && <Chip tone="orange">Tiene PIAR vigente</Chip>}
            {data.orientacion.tiene_remisiones && <Chip tone="neutral">Con remisiones a orientación</Chip>}
            {data.cierre_promocion && <Chip tone="neutral">Cierre: {data.cierre_promocion.resultado}</Chip>}
          </div>

          <Card>
            <CardHeader title="Notas cerradas por periodo" />
            <Table>
              <TableHead>
                <Th>Asignatura</Th>
                {periodos.map((p) => (
                  <Th key={p}>P{p}</Th>
                ))}
              </TableHead>
              <TableBody>
                {data.notas_por_periodo.length === 0 && <EmptyRow colSpan={periodos.length + 1}>Sin notas cerradas.</EmptyRow>}
                {data.notas_por_periodo.map((a) => (
                  <tr key={a.asignatura}>
                    <Td>{a.asignatura}</Td>
                    {periodos.map((p) => (
                      <Td key={p}>{a.periodos.find((x) => x.periodo === p)?.nota ?? '—'}</Td>
                    ))}
                  </tr>
                ))}
              </TableBody>
            </Table>
          </Card>

          {data.recuperaciones.length > 0 && (
            <Card>
              <CardHeader title="Recuperaciones" />
              <ul className="space-y-1 text-sm">
                {data.recuperaciones.map((r, i) => (
                  <li key={i}>
                    {r.asignatura} · {r.tipo === 'ANUAL' ? 'fin de año' : `periodo ${r.periodo}`}: {r.nota_original} → {r.nota_resultante ?? 'sin resultado'} ({r.estado.toLowerCase().replace('_', ' ')}, {r.intentos} intento(s))
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Inasistencias y convivencia" subtitle="De convivencia solo los conteos; el detalle está en el Observador, con sus propios permisos." />
            <p className="text-sm">
              Fallas: {data.inasistencias.total.injustificadas} injustificadas y {data.inasistencias.total.justificadas} justificadas, de {data.inasistencias.total.total} registros.
            </p>
            <p className="mt-1 text-sm">
              Observaciones: {data.convivencia.observaciones} · Faltas tipo I: {data.convivencia.faltas['I'] ?? 0}, II: {data.convivencia.faltas['II'] ?? 0}, III: {data.convivencia.faltas['III'] ?? 0}
            </p>
          </Card>

          {data.compromisos_previos.length > 0 && (
            <Card>
              <CardHeader title="Compromisos de sesiones anteriores" />
              <ul className="space-y-1 text-sm">
                {data.compromisos_previos.map((c, i) => (
                  <li key={i}>
                    {c.descripcion} — {c.responsable}, hasta {formatoFechaCalendario(c.fecha_limite)} ({c.estado.toLowerCase()}) · {c.sesion}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Drawer>
  );
}
