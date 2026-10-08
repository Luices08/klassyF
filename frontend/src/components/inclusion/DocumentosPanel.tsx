import { type FormEvent, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { api } from '../../lib/apiClient';
import {
  ROLES_FIRMANTE,
  descargarArchivo,
  nombreDe,
  useDocumentos,
  useEmitirDocumento,
  useFirmarDocumento,
  useVerificarIntegridad,
  type DocumentoEmitido,
  type Expediente,
} from '../../hooks/useInclusion';
import {} from './campos';
import { formatoFechaLocal } from '../../lib/fechas';

const TONO_ESTADO = { EMITIDO: 'orange', FIRMADO: 'green', SUSTITUIDO: 'neutral' } as const;
const NOMBRE_ESTADO = { EMITIDO: 'Emitido, pendiente de firma', FIRMADO: 'Firmado', SUSTITUIDO: 'Sustituido' } as const;

/**
 * Documentos que genera el sistema (Anexo 1, PIAR, acta de acuerdo, informe anual y el acta oficial que los reúne). Cada emisión
 * congela el contenido, le da un código y una huella; el PDF se imprime, se firma en físico y se sube el escaneo.
 */
export function DocumentosPanel({ exp }: { exp: Expediente }) {
  const documentos = useDocumentos(exp._id);
  const emitir = useEmitirDocumento(exp._id);
  const integridad = useVerificarIntegridad();
  const [firmando, setFirmando] = useState<DocumentoEmitido | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);

  if (documentos.isLoading) return <Spinner />;
  if (documentos.isError) return <Alert tone="error">{errorMessage(documentos.error)}</Alert>;
  if (!documentos.data) return null;
  const { catalogo, documentos: emitidos, puede_emitir, puede_firmar_institucional } = documentos.data;

  const verPdf = async (d: DocumentoEmitido) => {
    try {
      const { url } = await api.downloadBlob(`/inclusion/documentos/${d._id}/pdf`);
      window.open(url, '_blank');
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  const verificar = async (d: DocumentoEmitido) => {
    try {
      const r = await integridad.mutateAsync(d._id);
      setAviso(r.integro ? { tono: 'success', texto: `${r.codigo}: el contenido coincide con el emitido.` } : { tono: 'error', texto: `${r.codigo}: el contenido fue alterado después de emitirse.` });
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      {aviso && <Alert tone={aviso.tono}>{aviso.texto}</Alert>}
      {emitir.isError && <Alert tone="error">{errorMessage(emitir.error)}</Alert>}

      {puede_emitir && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Emitir un documento</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {catalogo.map((c) => {
              const puede = exp.editable && c.emisible_en.includes(exp.estado);
              return (
                <li key={c.clave} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold text-ink">{c.nombre}</span>
                    {c.numero_anexo && <span className="ml-2 text-xs text-muted">{c.numero_anexo}</span>}
                    {c.confidencial && <span className="ml-2"><Chip tone="red">Confidencial</Chip></span>}
                    {!puede && <span className="block text-xs text-muted">Disponible con el expediente en: {c.emisible_en.join(', ').toLowerCase().replace(/_/g, ' ')}</span>}
                  </span>
                  <Button variant="soft-edit" className="px-3 py-1 text-xs" disabled={!puede} isLoading={emitir.isPending && emitir.variables === c.clave} onClick={() => emitir.mutate(c.clave)}>
                    Emitir
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Documentos emitidos</h3>
        <Table>
          <TableHead>
            <tr>
              <Th>Documento</Th>
              <Th>Código</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {emitidos.map((d) => (
              <tr key={d._id}>
                <Td>
                  {d.nombre}
                  <span className="block text-xs text-muted">
                    v{d.version} · {formatoFechaLocal(d.fecha_emision)}
                  </span>
                </Td>
                <Td>
                  {d.codigo}
                  <span className="block text-xs text-muted">huella {d.huella}</span>
                </Td>
                <Td>
                  <Chip tone={TONO_ESTADO[d.estado]}>{NOMBRE_ESTADO[d.estado]}</Chip>
                  {d.desactualizado && d.estado === 'EMITIDO' && <span className="mt-1 block text-xs text-danger">Desactualizado: el expediente cambió</span>}
                  {d.firma && (
                    <span className="mt-1 block text-xs text-muted">
                      {d.firma.firmantes.map((f) => `${f.nombre} (${nombreDe(ROLES_FIRMANTE, f.rol)})`).join(', ')}
                    </span>
                  )}
                </Td>
                <Td className="space-x-2 text-right">
                  <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => verPdf(d)}>
                    PDF
                  </Button>
                  <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => verificar(d)}>
                    Verificar
                  </Button>
                  {puede_emitir && d.estado === 'EMITIDO' && !d.desactualizado && exp.editable && (!requiereRector(d, catalogo) || puede_firmar_institucional) && (
                    <Button variant="soft-success" className="px-3 py-1 text-xs" onClick={() => setFirmando(d)}>
                      Registrar firma
                    </Button>
                  )}
                  {d.firmado && (
                    <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => descargarArchivo(`/documentos/${d._id}/firmado/archivo`, `${d.codigo}-firmado`).catch((err) => setAviso({ tono: 'error', texto: errorMessage(err) }))}>
                      Escaneo
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {emitidos.length === 0 && <EmptyRow colSpan={4}>Aún no se ha emitido ningún documento.</EmptyRow>}
          </TableBody>
        </Table>
      </div>
      {firmando && <FirmaDrawer documento={firmando} exigeRector={requiereRector(firmando, catalogo)} onClose={() => setFirmando(null)} />}
    </div>
  );
}

const requiereRector = (d: DocumentoEmitido, catalogo: { clave: string; firma_admin: boolean }[]) => Boolean(catalogo.find((c) => c.clave === d.clave)?.firma_admin);

function FirmaDrawer({ documento, exigeRector, onClose }: { documento: DocumentoEmitido; exigeRector: boolean; onClose: () => void }) {
  const firmar = useFirmarDocumento();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [firmantes, setFirmantes] = useState([{ nombre: '', rol: 'ACUDIENTE' }]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!archivo) return;
    await firmar.mutateAsync({ id: documento._id, archivo, firmantes: firmantes.filter((f) => f.nombre.trim().length >= 3) });
    onClose();
  };

  return (
    <Drawer open title="Registrar firma" subtitle={`${documento.nombre} · ${documento.codigo}`} onClose={onClose} onSubmit={enviar} submitLabel="Registrar firma" isSubmitting={firmar.isPending} submitDisabled={!archivo || firmantes.every((f) => f.nombre.trim().length < 3)}>
      {firmar.isError && <Alert tone="error">{errorMessage(firmar.error)}</Alert>}
      <Alert tone="info">
        {exigeRector
          ? 'Imprime el documento, recoge las firmas y sube el escaneo. La firma institucional la registra el rector (administrador); si el estudiante es menor de edad firma su acudiente, y si es mayor, él mismo.'
          : 'Imprime el documento, recoge las firmas y sube el escaneo, que queda asociado a esta versión.'}
      </Alert>
      {firmantes.map((f, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto]">
          <Input label="Nombre de quien firma" value={f.nombre} onChange={(e) => setFirmantes((l) => l.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
          <Select label="En calidad de" value={f.rol} onChange={(e) => setFirmantes((l) => l.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))}>
            {ROLES_FIRMANTE.filter((r) => !(exigeRector && r.codigo === 'DIRECTIVO')).map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.nombre}
              </option>
            ))}
          </Select>
          {firmantes.length > 1 && (
            <Button type="button" variant="soft-danger" className="self-end" onClick={() => setFirmantes((l) => l.filter((_, j) => j !== i))}>
              Quitar
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setFirmantes((l) => [...l, { nombre: '', rol: 'DOCENTE' }])}>
        Agregar firmante
      </Button>
      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Escaneo del documento firmado</p>
        <input ref={entrada} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm text-body" />
        <p className="mt-1 text-xs text-muted">PDF, JPG, PNG o WEBP de hasta 5 MB.</p>
      </div>
    </Drawer>
  );
}
