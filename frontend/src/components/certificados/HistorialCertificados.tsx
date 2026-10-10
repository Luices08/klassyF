import { type FormEvent, useEffect, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { VisorDocumento } from '../ui/VisorDocumento';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import {
  ETIQUETA_ELEMENTO,
  descargarPdfCertificado,
  useAnularCertificado,
  useCertificados,
  useConfiguracionCertificados,
  useVerificarIntegridadCertificado,
  type CertificadoExpedido,
  type ClaveCertificado,
  type EstadoCertificado,
} from '../../hooks/useCertificados';
import { useAuth } from '../../context/AuthContext';
import { formatoFechaHora } from '../../lib/fechas';

/** Todo lo expedido, con quién lo expidió y cuándo. Nada se borra: un documento mal expedido se anula con motivo. */
export function HistorialCertificados() {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<ClaveCertificado | ''>('');
  const [estado, setEstado] = useState<EstadoCertificado | ''>('');
  const [pagina, setPagina] = useState(1);
  const [anulando, setAnulando] = useState<CertificadoExpedido | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);
  const lista = useCertificados({ tipo: tipo || undefined, estado: estado || undefined, pagina });
  const integridad = useVerificarIntegridadCertificado();
  const tipos = useConfiguracionCertificados().data?.tipos ?? [];

  // El documento se abre en un panel sobre el historial, no en otra pestaña.
  const [viendo, setViendo] = useState<{ url: string; certificado: CertificadoExpedido } | null>(null);
  useEffect(() => {
    const url = viendo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [viendo?.url]);

  const verPdf = async (c: CertificadoExpedido) => {
    try {
      const { url } = await descargarPdfCertificado(c._id);
      setViendo({ url, certificado: c });
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  const verificar = async (c: CertificadoExpedido) => {
    try {
      const r = await integridad.mutateAsync(c._id);
      setAviso(r.integro ? { tono: 'success', texto: `${r.codigo}: el contenido coincide con el expedido.` } : { tono: 'error', texto: `${r.codigo}: el contenido fue alterado después de expedirse.` });
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Documento" value={tipo} onChange={(e) => { setTipo(e.target.value as ClaveCertificado | ''); setPagina(1); }}>
          <option value="">Todos</option>
          {tipos.map((t) => (
            <option key={t.clave} value={t.clave}>
              {t.nombre}
            </option>
          ))}
        </Select>
        <Select label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value as EstadoCertificado | ''); setPagina(1); }}>
          <option value="">Todos</option>
          <option value="VIGENTE">Vigente</option>
          <option value="ANULADO">Anulado</option>
        </Select>
      </div>
      {aviso && <Alert tone={aviso.tono}>{aviso.texto}</Alert>}
      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      {lista.data && (
        <>
          <Table>
            <TableHead>
              <tr>
                <Th>Código</Th>
                <Th>Estudiante</Th>
                <Th>Expedición</Th>
                <Th>Estampado</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {lista.data.data.map((c) => (
                <tr key={c._id}>
                  <Td>
                    <span className="font-semibold text-ink">{c.codigo}</span>
                    <span className="block text-xs text-muted">{c.nombre_tipo}</span>
                  </Td>
                  <Td>
                    {c.estudiante}
                    <span className="block text-xs text-muted">
                      {c.documento} · {c.grado} · {c.anio}
                    </span>
                    {c.destinatario && <span className="block text-xs text-muted">Para: {c.destinatario}</span>}
                  </Td>
                  <Td>
                    {formatoFechaHora(c.fecha_emision)}
                    <span className="block text-xs text-muted">{c.emitido_por ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {(Object.keys(ETIQUETA_ELEMENTO) as (keyof typeof ETIQUETA_ELEMENTO)[]).filter((e) => c.firmas[e]).map((e) => (
                        <Chip key={e} tone="blue">
                          {e === 'rectoria' ? 'Rectoría' : e === 'secretaria' ? 'Secretaría' : 'Sello'}
                        </Chip>
                      ))}
                      {!Object.values(c.firmas).some(Boolean) && <span className="text-xs text-muted">Solo QR y huella</span>}
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={c.estado === 'VIGENTE' ? 'green' : 'red'}>{c.estado === 'VIGENTE' ? 'Vigente' : 'Anulado'}</Chip>
                    <span className="block text-xs text-muted">clave {c.huella}</span>
                  </Td>
                  <Td className="space-x-2 text-right">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => verPdf(c)}>
                      Ver
                    </Button>
                    <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => verificar(c)}>
                      Verificar
                    </Button>
                    {user?.rol === 'ADMIN' && c.estado === 'VIGENTE' && (
                      <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setAnulando(c)}>
                        Anular
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {lista.data.data.length === 0 && <EmptyRow colSpan={6}>Aún no se ha expedido ningún documento.</EmptyRow>}
            </TableBody>
          </Table>
          {lista.data.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                Página {lista.data.page} de {lista.data.pages} · {lista.data.total} documentos
              </span>
              <span className="space-x-2">
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="secondary" disabled={pagina >= lista.data.pages} onClick={() => setPagina((p) => p + 1)}>
                  Siguiente
                </Button>
              </span>
            </div>
          )}
        </>
      )}
      {anulando && <AnularDrawer certificado={anulando} onClose={() => setAnulando(null)} />}
      <Drawer open={Boolean(viendo)} title={viendo?.certificado.nombre_tipo ?? ''} subtitle={viendo ? `${viendo.certificado.codigo} · ${viendo.certificado.estudiante}` : undefined} onClose={() => setViendo(null)} size="xl">
        {viendo && <VisorDocumento url={viendo.url} titulo={viendo.certificado.codigo} nombreArchivo={`${viendo.certificado.codigo}.pdf`} className="h-[75vh]" />}
      </Drawer>
    </div>
  );
}

function AnularDrawer({ certificado, onClose }: { certificado: CertificadoExpedido; onClose: () => void }) {
  const anular = useAnularCertificado();
  const [motivo, setMotivo] = useState('');
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await anular.mutateAsync({ id: certificado._id, motivo: motivo.trim() });
    onClose();
  };
  return (
    <Drawer open title="Anular documento" subtitle={`${certificado.nombre_tipo} · ${certificado.codigo}`} onClose={onClose} onSubmit={enviar} submitLabel="Anular" submitVariant="soft-danger" isSubmitting={anular.isPending} submitDisabled={motivo.trim().length < 5}>
      {anular.isError && <Alert tone="error">{errorMessage(anular.error)}</Alert>}
      <Alert tone="warning">El documento no se borra: queda anulado, sigue verificándose como anulado y se imprime con la marca «ANULADO». Para corregirlo se expide uno nuevo.</Alert>
      <Input label="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} required />
    </Drawer>
  );
}
