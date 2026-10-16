import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, EyeIcon, FileTextIcon, XCircleIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { type DocumentoPorRevisar, useDocumentosPorRevisar, useRevisarDocumentoMatricula } from '../../hooks/useEnrollments';
import { api } from '../../lib/apiClient';
import { formatoFechaHora } from '../../lib/fechas';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../../types/domain';

const PAGE_SIZE = 25;

const nombreDelDocumento = (d: DocumentoPorRevisar) => d.nombre_personalizado || NOMBRES_DOCUMENTO_MATRICULA[d.tipo_documento];

/** Bandeja de secretaría (M04): los documentos que ya subieron y nadie ha revisado, sin entrar a cada matrícula. */
export function DocumentosPorRevisarPage() {
  const navigate = useNavigate();
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [page, setPage] = useState(1);
  const lista = useDocumentosPorRevisar({ academic_year_id: anio?._id, page, limit: PAGE_SIZE });
  const revisar = useRevisarDocumentoMatricula();

  const [rechazando, setRechazando] = useState<DocumentoPorRevisar | null>(null);
  const [comentario, setComentario] = useState('');

  async function verArchivo(d: DocumentoPorRevisar) {
    const { url } = await api.downloadBlob(`/enrollments/${d.enrollment_id}/checklist/${d.tipo_documento}/archivo`);
    window.open(url, '_blank');
  }

  async function cerrarRechazo() {
    setRechazando(null);
    setComentario('');
  }

  if (aniosQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentos por revisar"
        subtitle={anio ? `Lo que las familias y secretaría ya subieron y falta aprobar o rechazar · año ${anio.year}.` : undefined}
      />

      {!anio && <Alert tone="warning">Aún no hay un año lectivo. Crea uno en «Año lectivo» para recibir matrículas.</Alert>}
      {revisar.isError && <Alert tone="error">{errorMessage(revisar.error)}</Alert>}

      {anio && (
        <Card>
          {lista.isLoading && <Spinner />}
          {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
          {lista.data && (
            <>
              <Table>
                <TableHead>
                  <tr>
                    <Th>Estudiante</Th>
                    <Th>Grupo</Th>
                    <Th>Documento</Th>
                    <Th>Subido</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {lista.data.data.map((d) => (
                    <tr key={`${d.enrollment_id}-${d.tipo_documento}-${d.nombre_personalizado ?? ''}`}>
                      <Td>
                        <span className="font-medium text-ink">
                          {d.nombre} {d.apellido}
                        </span>
                        <span className="block text-xs text-muted">{d.numero_documento}</span>
                      </Td>
                      <Td>{d.grupo ?? '—'}</Td>
                      <Td>
                        {nombreDelDocumento(d)}
                        {d.obligatorio === false && <span className="block text-xs text-muted">Opcional</span>}
                      </Td>
                      <Td>{d.fecha_carga ? formatoFechaHora(d.fecha_carga) : '—'}</Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          <IconButton tone="neutral" label="Ver archivo" icon={<FileTextIcon />} onClick={() => void verArchivo(d)} />
                          <IconButton
                            tone="success"
                            label="Aprobar documento"
                            icon={<CheckCircleIcon />}
                            disabled={revisar.isPending}
                            onClick={() => revisar.mutate({ id: d.enrollment_id, tipoDocumento: d.tipo_documento, estado: 'APROBADO' })}
                          />
                          <IconButton tone="danger" label="Rechazar documento" icon={<XCircleIcon />} onClick={() => setRechazando(d)} />
                          <IconButton tone="edit" label="Abrir matrícula" icon={<EyeIcon />} onClick={() => navigate(`/admin/enrollments/${d.enrollment_id}`)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                  {lista.data.data.length === 0 && <EmptyRow colSpan={5}>No hay documentos esperando revisión.</EmptyRow>}
                </TableBody>
              </Table>

              {lista.data.pages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm text-muted">
                  <span>
                    Página {lista.data.page} de {lista.data.pages} ({lista.data.total} documentos)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <Button variant="secondary" disabled={page >= lista.data.pages} onClick={() => setPage((p) => p + 1)}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <Drawer
        open={rechazando !== null}
        title="Rechazar documento"
        subtitle={rechazando ? `${rechazando.nombre} ${rechazando.apellido} · ${nombreDelDocumento(rechazando)}` : undefined}
        onClose={() => void cerrarRechazo()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!rechazando) return;
          revisar.mutate(
            { id: rechazando.enrollment_id, tipoDocumento: rechazando.tipo_documento, estado: 'RECHAZADO', comentario },
            { onSuccess: () => void cerrarRechazo() }
          );
        }}
        submitLabel="Rechazar"
        submitVariant="soft-danger"
        isSubmitting={revisar.isPending}
        submitDisabled={!comentario.trim()}
      >
        <Input label="Comentario para el acudiente" required value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </Drawer>
    </div>
  );
}
