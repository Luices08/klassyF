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
  archivos?: Record<string, File>;
  onArchivoChange?: (tipoDoc: string, file: File | null) => void;
  documentacionCompleta?: boolean;
}

/**
 * Lo que se le pedirá al estudiante antes de crear la matrícula.
 * Permite adjuntar archivos directamente desde este drawer y visualiza el estado según si la documentación es completa o condicional.
 */
export function DocumentosPrevistos({ groupId, tipoIngreso, studentId, archivos = {}, onArchivoChange, documentacionCompleta }: Props) {
  const navigate = useNavigate();
  const consulta = useDocumentosPrevistos({ group_id: groupId || undefined, tipo_ingreso: tipoIngreso, student_id: studentId || undefined });

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos requeridos</h4>
        {documentacionCompleta ? (
          <Chip tone="green">Entrega completa</Chip>
        ) : (
          <Chip tone="orange">Con pendientes</Chip>
        )}
      </div>
      {!groupId && (
        <p className="text-xs text-muted">
          Mostrando requisitos base. Al seleccionar un grupo se complementarán los documentos específicos de su grado.
        </p>
      )}
      {consulta.isLoading && <Spinner />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.data && (
        <Table>
          <TableHead>
            <Th>Documento</Th>
            <Th>Archivo digital (opcional)</Th>
          </TableHead>
          <TableBody>
            {consulta.data.map((d) => {
              const archivo = archivos[d.tipo_documento];
              return (
                <tr key={d.tipo_documento}>
                  <Td>
                    <div className="font-medium text-ink">{d.nombre}</div>
                    <div className="text-xs text-muted">{d.obligatorio ? 'Obligatorio' : 'Opcional'}</div>
                  </Td>
                  <Td>
                    {onArchivoChange ? (
                      archivo ? (
                        <div className="flex items-center gap-1.5">
                          <Chip tone="green">Adjunto</Chip>
                          <span className="text-xs text-ink truncate max-w-[130px]" title={archivo.name}>
                            {archivo.name}
                          </span>
                          <button
                            type="button"
                            title="Quitar archivo"
                            onClick={() => onArchivoChange(d.tipo_documento, null)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800"
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-1 cursor-pointer text-xs font-medium text-primary hover:underline">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/png,image/jpeg"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onArchivoChange(d.tipo_documento, f);
                            }}
                          />
                          Adjuntar archivo
                        </label>
                      )
                    ) : (
                      <Chip tone="neutral">No enviado</Chip>
                    )}
                  </Td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted">
        {documentacionCompleta
          ? 'Los documentos físicos quedan registrados como completos. Adjuntar archivos digitales desde este drawer es totalmente opcional; puedes matricular de inmediato y cargar o verificar archivos después en su expediente.'
          : 'Los documentos sin adjuntar quedan cubiertos por el acta de compromiso con la fecha pactada. Adjuntar archivos desde aquí es opcional.'}
      </p>
      <Button type="button" variant="outline" onClick={() => navigate('/admin/documentos-por-revisar')}>
        Ir a documentos por revisar
      </Button>
    </div>
  );
}
