import { useState } from 'react';
import { descargarPdfCertificadoDelHijo, useCertificadosDelHijo, useGenerarCertificadoDelHijo, type CertificadoDelPortal, type TipoCertificadoAutoservicio } from '../../hooks/usePortal';
import { formatoFechaHora } from '../../lib/fechas';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { FileTextIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { VisorDocumento } from '../ui/VisorDocumento';

const OTRO = 'OTRO';

function TarjetaTipo({ tipo, generando, onGenerar }: { tipo: TipoCertificadoAutoservicio; generando: boolean; onGenerar: (destinatario?: { clave: string; otro?: string }) => void }) {
  const [clave, setClave] = useState(tipo.destinatarios[0]?.clave ?? '');
  const [otro, setOtro] = useState('');
  const esOtro = clave === OTRO;
  const incompleto = esOtro && otro.trim().length < 3;

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-h3 text-ink">{tipo.nombre}</h3>
        {tipo.descripcion && <p className="text-sm text-muted">{tipo.descripcion}</p>}
      </div>
      {tipo.destinatarios.length > 0 && (
        <Select label="¿Para qué lo necesitas?" value={clave} onChange={(e) => setClave(e.target.value)}>
          {tipo.destinatarios.map((d) => (
            <option key={d.clave} value={d.clave}>
              {d.etiqueta}
            </option>
          ))}
          <option value={OTRO}>Otro (especificar…)</option>
        </Select>
      )}
      {esOtro && <Input label="Entidad o motivo" value={otro} maxLength={120} onChange={(e) => setOtro(e.target.value)} />}
      {tipo.motivo && <Alert tone="warning">{tipo.motivo}</Alert>}
      <Button type="button" isLoading={generando} disabled={!tipo.disponible || incompleto} onClick={() => onGenerar(clave ? { clave, ...(esOtro ? { otro: otro.trim() } : {}) } : undefined)}>
        <FileTextIcon className="h-4 w-4" />
        Generar y descargar
      </Button>
    </Card>
  );
}

/**
 * Certificados de estudio que el acudiente genera solo (M26): el sistema arma el PDF con la plantilla vigente del colegio, con su código
 * y QR de verificación, sin esperar a secretaría. Solo se ofrecen los tipos que el administrador habilitó para autoservicio.
 */
export function PortalCertificados({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useCertificadosDelHijo(studentId);
  const generar = useGenerarCertificadoDelHijo(studentId);
  const [viendo, setViendo] = useState<{ certificado: Pick<CertificadoDelPortal, 'codigo' | 'nombre_tipo'>; url: string } | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [errorVer, setErrorVer] = useState<string | null>(null);

  async function ver(c: Pick<CertificadoDelPortal, '_id' | 'codigo' | 'nombre_tipo'>) {
    setErrorVer(null);
    setAbriendo(c._id);
    try {
      const { url } = await descargarPdfCertificadoDelHijo(studentId, c._id);
      setViendo({ certificado: c, url });
    } catch (err) {
      setErrorVer(errorMessage(err));
    } finally {
      setAbriendo(null);
    }
  }

  async function alGenerar(tipo: string, destinatario?: { clave: string; otro?: string }) {
    setErrorVer(null);
    const creado = await generar.mutateAsync({ tipo, destinatario });
    await ver(creado);
  }

  function cerrar() {
    if (viendo) URL.revokeObjectURL(viendo.url);
    setViendo(null);
  }

  if (isLoading) return <Spinner />;
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {(generar.isError || errorVer) && <Alert tone="error">{errorVer ?? errorMessage(generar.error)}</Alert>}

      {data.tipos.length === 0 ? (
        <Alert tone="info">Por ahora la institución no tiene certificados de autoservicio. Puedes solicitarlos en la secretaría académica.</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.tipos.map((t) => (
            <TarjetaTipo key={t.clave} tipo={t} generando={generar.isPending && generar.variables?.tipo === t.clave} onGenerar={(d) => void alGenerar(t.clave, d).catch(() => undefined)} />
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-h3 text-ink">Documentos expedidos</h3>
        <Table>
          <TableHead>
            <Th>Documento</Th>
            <Th>Código</Th>
            <Th>Para</Th>
            <Th>Fecha</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </TableHead>
          <TableBody>
            {data.emitidos.map((c) => (
              <tr key={c._id}>
                <Td className="font-medium text-ink">{c.nombre_tipo}</Td>
                <Td>{c.codigo}</Td>
                <Td>{c.destinatario}</Td>
                <Td>{formatoFechaHora(c.fecha_emision)}</Td>
                <Td>{c.estado === 'ANULADO' ? <Chip tone="red">Anulado</Chip> : <Chip tone="green">Vigente</Chip>}</Td>
                <Td className="text-right">
                  <Button variant="soft-edit" className="px-3 py-1 text-xs" isLoading={abriendo === c._id} onClick={() => void ver(c)}>
                    Ver y descargar
                  </Button>
                </Td>
              </tr>
            ))}
            {data.emitidos.length === 0 && <EmptyRow colSpan={6}>Aún no hay documentos expedidos para este estudiante.</EmptyRow>}
          </TableBody>
        </Table>
      </div>

      <Drawer open={Boolean(viendo)} title={viendo?.certificado.nombre_tipo ?? ''} subtitle={viendo?.certificado.codigo} onClose={cerrar} size="xl">
        {viendo && <VisorDocumento url={viendo.url} titulo={viendo.certificado.codigo} nombreArchivo={`${viendo.certificado.codigo}.pdf`} className="h-[75vh]" />}
      </Drawer>
    </div>
  );
}
