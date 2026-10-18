import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { FiltrosRapidos } from '../../components/ui/FiltrosRapidos';
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
import { nombreDeItem } from '../../types/domain';

const PAGE_SIZE = 25;

const nombreDelDocumento = (d: DocumentoPorRevisar) => nombreDeItem(d);

const quienSubio = (d: DocumentoPorRevisar) => (d.cargado_por_tipo === 'FAMILIA' ? 'La familia' : d.cargado_por_tipo === 'PERSONAL' ? d.cargado_por_nombre?.trim() || 'Personal del colegio' : '—');

/** Bandeja de secretaría (M04): los documentos que ya subieron y nadie ha revisado, sin entrar a cada matrícula. */
export function DocumentosPorRevisarPage() {
  const navigate = useNavigate();
  const { anio, query: aniosQuery } = useAnioDeTrabajo();
  const [page, setPage] = useState(1);
  const [subidoPor, setSubidoPor] = useState<'TODOS' | 'FAMILIA' | 'PERSONAL'>('TODOS');
  const lista = useDocumentosPorRevisar({ academic_year_id: anio?._id, subido_por: subidoPor === 'TODOS' ? undefined : subidoPor, page, limit: PAGE_SIZE });
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
        subtitle={anio ? `Archivos subidos que nadie ha aprobado ni rechazado · año ${anio.year}. Lo que el personal sube marcando «ya verifiqué el original» no pasa por aquí.` : undefined}
      />

      {!anio && <Alert tone="warning">Aún no hay un año lectivo. Crea uno en «Año lectivo» para recibir matrículas.</Alert>}
      {revisar.isError && <Alert tone="error">{errorMessage(revisar.error)}</Alert>}

      {anio && (
        <Card>
          <div className="mb-3">
            <FiltrosRapidos
              ariaLabel="Quién subió el documento"
              valor={subidoPor}
              onChange={(k) => {
                setSubidoPor(k as 'TODOS' | 'FAMILIA' | 'PERSONAL');
                setPage(1);
              }}
              items={[
                { clave: 'TODOS', etiqueta: 'Todos' },
                { clave: 'FAMILIA', etiqueta: 'Subidos por familias' },
                { clave: 'PERSONAL', etiqueta: 'Subidos por el personal' },
              ]}
            />
          </div>
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
                    <Th>Subido por</Th>
                    <Th>Fecha</Th>
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
                      <Td>{quienSubio(d)}</Td>
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
                  {lista.data.data.length === 0 && <EmptyRow colSpan={6}>No hay documentos esperando revisión.</EmptyRow>}
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
