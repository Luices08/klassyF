import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useCuposPrematricula } from '../../hooks/useAdmissionRequests';
import { formatoFechaCalendario } from '../../lib/fechas';

/**
 * Los cupos del año por grado, sede y jornada (prematrícula): lo que caben los grupos, lo que ya tienen las matrículas, lo que está reservado y quién espera.
 * Se calcula en vivo de los grupos y las reservas: nunca queda desfasado.
 */
export function CuposPrematriculaPanel({ anioId }: { anioId: string | undefined }) {
  const cupos = useCuposPrematricula(anioId);

  if (!anioId) return <Alert tone="warning">Aún no hay un año lectivo. Créalo en «Año lectivo».</Alert>;
  if (cupos.isLoading) return <Spinner />;
  if (cupos.isError) return <Alert tone="error">{errorMessage(cupos.error)}</Alert>;
  if (!cupos.data) return null;
  const v = cupos.data;

  return (
    <Card>
      <CardHeader
        title={`Cupos ${v.anio.year}`}
        subtitle="Capacidad de los grupos, matriculados o preinscritos, cupos reservados a solicitudes (sin grupo todavía) y solicitudes en espera, por grado, sede y jornada."
        action={v.ventana ? <Chip tone={v.ventana.abierta ? 'green' : 'neutral'}>{v.ventana.abierta ? 'Prematrícula abierta' : 'Prematrícula cerrada'}</Chip> : <Chip tone="orange">Sin ventana configurada</Chip>}
      />
      {v.reservas_vencidas > 0 && (
        <Alert tone="warning">
          {v.reservas_vencidas} reserva{v.reservas_vencidas === 1 ? '' : 's'} pasó el último día para matricular
          {v.ventana?.fecha_limite_matricula ? ` (${formatoFechaCalendario(v.ventana.fecha_limite_matricula)})` : ''}: ya no ocupa{v.reservas_vencidas === 1 ? '' : 'n'} cupo. Se pueden rechazar o matricular si aún hay lugar.
        </Alert>
      )}
      <Table>
        <TableHead>
          <Th>Grado</Th>
          <Th>Sede</Th>
          <Th>Jornada</Th>
          <Th className="text-right">Capacidad</Th>
          <Th className="text-right">Matriculados</Th>
          <Th className="text-right">Reservados</Th>
          <Th className="text-right">En espera</Th>
          <Th className="text-right">Libres</Th>
        </TableHead>
        <TableBody>
          {v.filas.map((f) => (
            <tr key={`${f.grado.id}-${f.sede.id}-${f.jornada.id}`}>
              <Td className="font-medium text-ink">{f.grado.nombre}</Td>
              <Td>{f.sede.nombre}</Td>
              <Td>{f.jornada.nombre}</Td>
              <Td className="text-right">{f.capacidad}</Td>
              <Td className="text-right">{f.ocupados}</Td>
              <Td className="text-right">{f.reservados}</Td>
              <Td className="text-right">{f.en_espera}</Td>
              <Td className="text-right">
                <Chip tone={f.libres > 0 ? 'green' : f.libres === 0 ? 'orange' : 'red'}>{f.libres}</Chip>
              </Td>
            </tr>
          ))}
          {v.filas.length === 0 && <EmptyRow colSpan={8}>El año {v.anio.year} aún no tiene grupos. Créalos en «Grupos».</EmptyRow>}
        </TableBody>
      </Table>
    </Card>
  );
}
