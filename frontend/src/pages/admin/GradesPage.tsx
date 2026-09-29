import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { BanIcon, RefreshIcon } from '../../components/ui/icons';
import { useActualizarEstadoGrado, useGrades } from '../../hooks/useCatalogs';
import type { EstadoActivo } from '../../types/domain';

const NIVEL_LABELS: Record<string, string> = {
  PREESCOLAR: 'Preescolar',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  MEDIA: 'Media',
};

export function GradesPage() {
  const gradesQuery = useGrades();
  const actualizarEstado = useActualizarEstadoGrado();

  async function handleToggle(id: string, estadoActual: EstadoActivo) {
    actualizarEstado.reset();
    const siguiente: EstadoActivo = estadoActual === 'activo' ? 'inactivo' : 'activo';
    await actualizarEstado.mutateAsync({ id, estado: siguiente });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de grados"
        subtitle="Preescolar a Media (Transición a Once). Desactiva los grados que la institución no ofrezca."
      />

      <Card>
        <CardHeader title="Grados" />
        {gradesQuery.isLoading && <Spinner />}
        {gradesQuery.isError && <Alert tone="error">{errorMessage(gradesQuery.error)}</Alert>}
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        {gradesQuery.data && (
          <Table>
            <TableHead>
              <Th>Nivel</Th>
              <Th>Grado</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {gradesQuery.data.map((g) => (
                <tr key={g._id}>
                  <Td>
                    <Chip tone="blue">{NIVEL_LABELS[g.nivel] ?? g.nivel}</Chip>
                  </Td>
                  <Td className="font-medium text-ink">{g.nombre}</Td>
                  <Td>
                    <EstadoUsuarioBadge value={g.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        tone={g.estado === 'activo' ? 'neutral' : 'success'}
                        label={g.estado === 'activo' ? 'Desactivar grado' : 'Activar grado'}
                        icon={g.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                        disabled={actualizarEstado.isPending}
                        onClick={() => handleToggle(g._id, g.estado)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {gradesQuery.data.length === 0 && <EmptyRow colSpan={4}>Sin grados en el catálogo.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
