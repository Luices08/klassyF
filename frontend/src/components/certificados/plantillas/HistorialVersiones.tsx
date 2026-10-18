import { Alert, errorMessage } from '../../ui/Alert';
import { Spinner } from '../../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../ui/Table';
import { useVersionesPlantilla, type ClaveCertificado } from '../../../hooks/useCertificados';
import { formatoFechaHora } from '../../../lib/fechas';

/** Todas las versiones publicadas de un documento: cada una conserva su huella y quién la publicó. */
export function HistorialVersiones({ tipo }: { tipo: ClaveCertificado }) {
  const versiones = useVersionesPlantilla(tipo);
  if (versiones.isLoading) return <Spinner />;
  if (versiones.isError) return <Alert tone="error">{errorMessage(versiones.error)}</Alert>;
  return (
    <Table>
      <TableHead>
        <tr>
          <Th>Versión</Th>
          <Th>Publicada</Th>
          <Th>Por</Th>
          <Th>Nota</Th>
          <Th>Huella</Th>
        </tr>
      </TableHead>
      <TableBody>
        {versiones.data?.map((v) => (
          <tr key={v.version}>
            <Td className="font-semibold text-ink">
              v{v.version} {v.estado === 'VIGENTE' && <span className="text-xs font-normal text-success">vigente</span>}
            </Td>
            <Td>{formatoFechaHora(v.publicada_at)}</Td>
            <Td>{v.publicada_por ?? '—'}</Td>
            <Td>{v.nota || '—'}</Td>
            <Td className="font-mono text-xs">{v.hash}</Td>
          </tr>
        ))}
        {versiones.data?.length === 0 && <EmptyRow colSpan={5}>Sin versiones.</EmptyRow>}
      </TableBody>
    </Table>
  );
}
