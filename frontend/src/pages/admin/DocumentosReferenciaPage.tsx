import { useState } from 'react';
import { DocumentoReferenciaDrawer } from '../../components/planeacion/DocumentoReferenciaDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/ui/icons';
import { VistaPreviaPdf } from '../../components/ui/VistaPreviaPdf';
import { cargarArchivoDocumento, useDocumentosReferencia, useEliminarDocumentoReferencia } from '../../hooks/useDocumentosReferencia';
import { useAreas } from '../../hooks/useCatalogoAcademico';
import { useGrades } from '../../hooks/useCatalogs';
import { formatoFechaLocal } from '../../lib/fechas';
import { nombreDePersona, tamanoLegible } from '../../lib/planeacion';
import type { DocumentoReferencia } from '../../types/domain';

/**
 * Documentos de apoyo (DBA, estándares, lineamientos y otros PDF) que coordinación carga y asigna a un área y a los grados donde aplican.
 * Los docentes los consultan en un panel al lado de su plan de área y de su plan de aula.
 */
export function DocumentosReferenciaPage() {
  const [areaId, setAreaId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const documentos = useDocumentosReferencia({ area_id: areaId, grade_id: gradoId });
  const areas = useAreas();
  const grados = useGrades('activo');
  const eliminar = useEliminarDocumentoReferencia();

  const [editando, setEditando] = useState<DocumentoReferencia | 'nuevo' | null>(null);
  const [viendo, setViendo] = useState<DocumentoReferencia | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function eliminarDocumento(documento: DocumentoReferencia) {
    if (!window.confirm(`¿Eliminar «${documento.titulo}»? Los docentes dejarán de verlo. Esta acción no se puede deshacer.`)) return;
    setMensaje(null);
    try {
      await eliminar.mutateAsync(documento._id);
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentos de apoyo"
        subtitle="PDF de referencia (DBA, estándares, lineamientos) asignados a un área y a los grados donde aplican, para que los docentes los consulten."
        action={
          <Button type="button" onClick={() => setEditando('nuevo')}>
            <PlusIcon className="h-4 w-4" />
            Nuevo documento
          </Button>
        }
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Todas</option>
            {(areas.data ?? []).map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </Select>
          <Select label="Grado" value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
            <option value="">Todos</option>
            {(grados.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {mensaje && <Alert tone="error">{mensaje}</Alert>}
      {documentos.isLoading && <Spinner label="Cargando los documentos..." />}
      {documentos.isError && <Alert tone="error">{errorMessage(documentos.error)}</Alert>}

      <Table>
        <TableHead>
          <Th>Documento</Th>
          <Th>Área</Th>
          <Th>Grados</Th>
          <Th>Archivo</Th>
          <Th className="text-right">Acciones</Th>
        </TableHead>
        <TableBody>
          {!documentos.isLoading && (documentos.data ?? []).length === 0 && (
            <EmptyRow colSpan={5}>Aún no hay documentos de apoyo{areaId || gradoId ? ' con esos filtros' : ''}. Carga el primero con «Nuevo documento».</EmptyRow>
          )}
          {(documentos.data ?? []).map((d) => (
            <tr key={d._id}>
              <Td>
                <p className="font-semibold text-ink">{d.titulo}</p>
                {d.descripcion && <p className="text-xs text-muted">{d.descripcion}</p>}
              </Td>
              <Td>{d.area?.nombre ?? '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {d.grados.map((g) => (
                    <Chip key={g._id} tone="blue">
                      {g.nombre}
                    </Chip>
                  ))}
                </div>
              </Td>
              <Td>
                <p className="text-sm text-ink">{d.archivo.nombre}</p>
                <p className="text-xs text-muted">
                  {tamanoLegible(d.archivo.bytes)} · {nombreDePersona(d.subido_por)} · {formatoFechaLocal(d.updatedAt)}
                </p>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <IconButton tone="success" label="Ver documento" icon={<EyeIcon />} onClick={() => setViendo(d)} />
                  <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setEditando(d)} />
                  <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => void eliminarDocumento(d)} />
                </div>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>

      {editando && (
        <DocumentoReferenciaDrawer
          key={editando === 'nuevo' ? 'nuevo' : editando._id}
          open
          onClose={() => setEditando(null)}
          documento={editando === 'nuevo' ? null : editando}
          areas={areas.data ?? []}
          grados={grados.data ?? []}
        />
      )}

      <Drawer open={viendo !== null} title={viendo?.titulo ?? ''} subtitle={viendo?.area?.nombre} onClose={() => setViendo(null)} size="xl">
        {viendo && (
          <VistaPreviaPdf
            claveConsulta={['documento-referencia', viendo._id, viendo.updatedAt]}
            cargar={() => cargarArchivoDocumento(viendo._id)}
            nombreArchivo={viendo.archivo.nombre}
            titulo={viendo.titulo}
          />
        )}
      </Drawer>
    </div>
  );
}
