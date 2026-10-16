import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import type { TipoIngreso } from '../../types/domain';

interface Props {
  groupId: string;
  tipoIngreso: TipoIngreso;
  studentId?: string;
}

/**
 * Lo que se le pedirá al estudiante antes de crear la matrícula. Todos nacen «No enviado»: los documentos se suben y se
 * aprueban en el expediente de la matrícula (o desde «Documentos por revisar»), no en este formulario.
 */
export function DocumentosPrevistos({ groupId, tipoIngreso, studentId }: Props) {
  const navigate = useNavigate();
  const consulta = useDocumentosPrevistos({ group_id: groupId || undefined, tipo_ingreso: tipoIngreso, student_id: studentId || undefined });

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos que se pedirán</h4>
      {!groupId && <p className="text-xs text-muted">Elige el grupo para ver qué documentos exige su grado.</p>}
      {consulta.isLoading && groupId && <Spinner />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.data && (
        <Table>
          <TableHead>
            <Th>Documento</Th>
            <Th>Estado</Th>
          </TableHead>
          <TableBody>
            {consulta.data.map((d) => (
              <tr key={d.tipo_documento}>
                <Td>
                  <div className="font-medium text-ink">{d.nombre}</div>
                  <div className="text-xs text-muted">{d.obligatorio ? 'Obligatorio' : 'Opcional'}</div>
                </Td>
                <Td>
                  <Chip tone="neutral">No enviado</Chip>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted">
        Al crear la matrícula se abre su expediente: ahí se suben los documentos y se marcan como aprobados, en revisión o rechazados. La matrícula pasa sola a
        definitiva cuando todos los obligatorios estén aprobados.
      </p>
      <Button type="button" variant="outline" onClick={() => navigate('/admin/documentos-por-revisar')}>
        Ir a documentos por revisar
      </Button>
    </div>
  );
}
