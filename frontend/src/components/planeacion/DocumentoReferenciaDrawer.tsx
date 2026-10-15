import { type FormEvent, useState } from 'react';
import { MAX_BYTES_PLANEACION, MAX_DESCRIPCION_PLAN, MAX_TITULO_PLAN, tamanoLegible } from '../../lib/planeacion';
import {
  useActualizarDocumentoReferencia,
  useCrearDocumentoReferencia,
  useReemplazarArchivoDocumento,
} from '../../hooks/useDocumentosReferencia';
import type { Area, DocumentoReferencia, Grade } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Dropzone } from '../ui/Dropzone';
import { Input, Select, Textarea } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';

interface DocumentoReferenciaDrawerProps {
  open: boolean;
  onClose: () => void;
  /** null = documento nuevo. */
  documento: DocumentoReferencia | null;
  areas: Area[];
  grados: Grade[];
}

/**
 * Alta y edición de un documento de apoyo (DBA, estándares, lineamientos): título, el área y los grados a los que aplica, y su PDF.
 * Es solo consulta para los docentes: nada se liga a él por llave, así que cambiarlo o quitarlo no deja datos colgando.
 */
export function DocumentoReferenciaDrawer({ open, onClose, documento, areas, grados }: DocumentoReferenciaDrawerProps) {
  const [titulo, setTitulo] = useState(documento?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(documento?.descripcion ?? '');
  const [areaId, setAreaId] = useState(documento?.area?._id ?? '');
  const [gradosIds, setGradosIds] = useState<string[]>(documento?.grados.map((g) => g._id) ?? []);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearDocumentoReferencia();
  const actualizar = useActualizarDocumentoReferencia();
  const reemplazar = useReemplazarArchivoDocumento();
  const guardando = crear.isPending || actualizar.isPending || reemplazar.isPending;

  const datosCompletos = titulo.trim().length > 0 && areaId !== '' && gradosIds.length > 0 && (documento !== null || archivo !== null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = { titulo: titulo.trim(), descripcion: descripcion.trim(), area_id: areaId, grados_ids: gradosIds };
    try {
      if (documento) {
        await actualizar.mutateAsync({ id: documento._id, datos });
        if (archivo) await reemplazar.mutateAsync({ id: documento._id, archivo });
      } else if (archivo) {
        await crear.mutateAsync({ datos, archivo });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer
      open={open}
      title={documento ? 'Editar documento de apoyo' : 'Nuevo documento de apoyo'}
      subtitle="PDF que los docentes consultan al armar su plan de área o de aula."
      onClose={onClose}
      onSubmit={handleSubmit}
      isSubmitting={guardando}
      submitDisabled={!datosCompletos}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Input label="Título" required maxLength={MAX_TITULO_PLAN} value={titulo} onChange={(e) => setTitulo(e.target.value)} hint="Ej.: DBA de Matemáticas (MEN)." />
      <Textarea
        label="Descripción"
        rows={3}
        maxLength={MAX_DESCRIPCION_PLAN}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        hint="Opcional: de qué trata o qué versión es."
      />
      <Select label="Área a la que aplica" required value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        <option value="">Selecciona un área…</option>
        {areas.map((a) => (
          <option key={a._id} value={a._id}>
            {a.nombre}
          </option>
        ))}
      </Select>
      <MultiSelect
        label="Grados a los que aplica"
        options={grados.map((g) => ({ value: g._id, label: g.nombre }))}
        selected={gradosIds}
        onChange={setGradosIds}
        allLabel="Todos los grados"
        emptyLabel="Elige al menos un grado"
      />
      <div>
        <p className="mb-1.5 text-label text-body">{documento ? 'Reemplazar el PDF (opcional)' : 'Documento (PDF)'}</p>
        {documento && (
          <p className="mb-2 text-xs text-muted">
            Actual: {documento.archivo.nombre} · {tamanoLegible(documento.archivo.bytes)}. Si no eliges otro, se conserva.
          </p>
        )}
        <Dropzone
          extensiones={['.pdf']}
          maxBytes={MAX_BYTES_PLANEACION}
          file={archivo}
          onFile={setArchivo}
          disabled={guardando}
          hint="Solo PDF, hasta 25 MB."
          etiqueta="Documento de apoyo en PDF"
        />
      </div>
    </Drawer>
  );
}
