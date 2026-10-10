import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { Chip } from '../ui/Badge';
import { ETIQUETA_ELEMENTO, useImagenesUsadas, usePreviaRevocacion, useRevocarPorElemento, type ImagenUsada } from '../../hooks/useCertificados';
import { formatoFechaLocal } from '../../lib/fechas';

/**
 * Solo el administrador. Reemplazar el sello o una firma no anula lo ya expedido (cada documento conserva lo que se estampó); esto es para el
 * caso excepcional de una imagen comprometida: anula de una vez todos los documentos vigentes que la usaron, con motivo y la contraseña.
 */
export function RevocacionPorElementoCard() {
  const imagenes = useImagenesUsadas(true);
  const [elegida, setElegida] = useState<ImagenUsada | null>(null);

  return (
    <Card className="space-y-4">
      <CardHeader
        title="Si una firma o el sello se vio comprometido"
        subtitle="Cambiar la imagen NO anula lo ya expedido: cada documento conserva la que tenía y sigue siendo válido. Solo si esa imagen se robó o se usó sin autorización, anula de una vez los documentos que la llevan."
      />
      {imagenes.isError && <Alert tone="error">{errorMessage(imagenes.error)}</Alert>}
      <Table>
        <TableHead>
          <tr>
            <Th>Elemento</Th>
            <Th>Imagen (huella)</Th>
            <Th>Documentos vigentes</Th>
            <Th>Expedidos</Th>
            <Th className="text-right">Acción</Th>
          </tr>
        </TableHead>
        <TableBody>
          {imagenes.data?.map((i) => (
            <tr key={`${i.elemento}:${i.hash}`}>
              <Td className="font-semibold text-ink">{ETIQUETA_ELEMENTO[i.elemento]}</Td>
              <Td>
                <span className="font-mono text-xs">{i.huella}</span> {i.es_la_actual && <Chip tone="green">La actual</Chip>}
              </Td>
              <Td>{i.documentos}</Td>
              <Td className="text-xs text-muted">
                {formatoFechaLocal(i.desde)} – {formatoFechaLocal(i.hasta)}
              </Td>
              <Td className="text-right">
                <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setElegida(i)}>
                  Anular estos documentos
                </Button>
              </Td>
            </tr>
          ))}
          {imagenes.data?.length === 0 && <EmptyRow colSpan={5}>Aún no hay documentos vigentes con firmas o sello estampados.</EmptyRow>}
        </TableBody>
      </Table>
      {elegida && <RevocacionDrawer imagen={elegida} onClose={() => setElegida(null)} />}
    </Card>
  );
}

function RevocacionDrawer({ imagen, onClose }: { imagen: ImagenUsada; onClose: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [clave, setClave] = useState('');
  const criterio = { elemento: imagen.elemento, imagen_hash: imagen.hash };
  const previa = usePreviaRevocacion(criterio);
  const revocar = useRevocarPorElemento();

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await revocar.mutateAsync({ ...criterio, motivo: motivo.trim(), confirm_password: clave });
    onClose();
  };

  return (
    <Drawer
      open
      title="Anular documentos por imagen comprometida"
      subtitle={`${ETIQUETA_ELEMENTO[imagen.elemento]} · ${imagen.huella}`}
      onClose={onClose}
      onSubmit={(e) => void enviar(e).catch(() => undefined)}
      submitLabel={`Anular ${previa.data?.documentos ?? ''} documento(s)`}
      submitVariant="soft-danger"
      isSubmitting={revocar.isPending}
      submitDisabled={motivo.trim().length < 10 || clave.length === 0 || !previa.data?.documentos}
    >
      {revocar.isError && <Alert tone="error">{errorMessage(revocar.error)}</Alert>}
      <Alert tone="warning">
        Se anulan <strong>{previa.data?.documentos ?? '…'}</strong> documento(s) vigentes que llevan esta imagen. Nada se borra: quedan anulados, se verifican como anulados y se imprimen con la marca «ANULADO». Para corregirlos hay que expedir
        documentos nuevos.
      </Alert>
      <Input label="Motivo (queda en cada documento)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} required hint="Mínimo 10 caracteres." />
      <Input label="Tu contraseña de administrador" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
    </Drawer>
  );
}
