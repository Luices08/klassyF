import { useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import {
  ELEMENTOS_AUTENTICACION,
  ETIQUETA_ELEMENTO,
  MODOS_ELEMENTO,
  useActualizarConfiguracionCertificados,
  useConfiguracionCertificados,
  useImagenCertificado,
  useQuitarImagenCertificado,
  useSubirImagenCertificado,
  type ConfiguracionCertificados,
  type ElementoAutenticacion,
  type ModoElemento,
} from '../../hooks/useCertificados';
import { useUsers } from '../../hooks/useUsers';

/**
 * Quién firma los certificados, con qué imágenes y qué se estampa por defecto en cada documento. Solo el ADMIN la cambia.
 * Nada de esto toca lo ya expedido: cada documento conserva sus firmantes e imágenes.
 */
export function ConfiguracionCertificadosPanel() {
  const configuracion = useConfiguracionCertificados();
  const actualizar = useActualizarConfiguracionCertificados();

  if (configuracion.isLoading) return <Spinner />;
  if (configuracion.isError) return <Alert tone="error">{errorMessage(configuracion.error)}</Alert>;
  if (!configuracion.data) return null;
  const c = configuracion.data;

  return (
    <div className="space-y-4">
      {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
      <Alert tone="info">
        El nombre de quien firma sale de su usuario en el sistema. Las imágenes de firma y sello se guardan sin modificarse: si las reemplazas, los documentos ya expedidos siguen saliendo con la imagen que tenían.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <FirmanteCard titulo="Rectoría" elemento="rectoria" rol="ADMIN" firmante={c.rectoria} />
        <FirmanteCard titulo="Secretaría Académica" elemento="secretaria" rol="SECRETARIA" firmante={c.secretaria} />
      </div>

      <Card>
        <CardHeader title="Sello institucional" />
        <ImagenCard elemento="sello" tieneImagen={c.sello.tiene_imagen} />
      </Card>

      <Card>
        <Switch
          label="La secretaría puede estampar la firma de Rectoría"
          description="Si lo apagas, solo el administrador puede encender ese switch al expedir. Cada uso queda registrado en el documento y en auditoría."
          checked={c.permitir_firma_rectoria_a_secretaria}
          onChange={(valor) => actualizar.mutate({ permitir_firma_rectoria_a_secretaria: valor })}
          disabled={actualizar.isPending}
        />
      </Card>

      <Card>
        <CardHeader title="Qué se estampa en cada documento" subtitle="El valor de partida del switch al expedir, y si se puede cambiar. El QR y la huella van siempre." />
        <PoliticaTabla configuracion={c} onCambio={(clave, elemento, modo) => actualizar.mutate({ politica: { [clave]: { [elemento]: modo } } })} deshabilitado={actualizar.isPending} />
      </Card>
    </div>
  );
}

function FirmanteCard({ titulo, elemento, rol, firmante }: { titulo: string; elemento: 'rectoria' | 'secretaria'; rol: 'ADMIN' | 'SECRETARIA'; firmante: ConfiguracionCertificados['rectoria'] }) {
  const usuarios = useUsers({ rol, estado: 'activo' });
  const actualizar = useActualizarConfiguracionCertificados();
  const [cargo, setCargo] = useState(firmante.cargo);

  return (
    <Card className="space-y-4">
      <CardHeader title={titulo} />
      {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
      <Select label="Quién firma" value={firmante.usuario_id ?? ''} onChange={(e) => actualizar.mutate({ [elemento]: { usuario_id: e.target.value || null } })} disabled={actualizar.isPending || usuarios.isLoading}>
        <option value="">Sin designar</option>
        {usuarios.data?.map((u) => (
          <option key={u._id} value={u._id}>
            {u.nombre} {u.apellido}
          </option>
        ))}
      </Select>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input label="Cargo que se imprime" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} />
        </div>
        <Button variant="soft-edit" disabled={cargo.trim().length < 2 || cargo.trim() === firmante.cargo} isLoading={actualizar.isPending} onClick={() => actualizar.mutate({ [elemento]: { cargo: cargo.trim() } })}>
          Guardar
        </Button>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Imagen de la firma</p>
        <ImagenCard elemento={elemento} tieneImagen={firmante.tiene_imagen} />
      </div>
    </Card>
  );
}

function ImagenCard({ elemento, tieneImagen }: { elemento: ElementoAutenticacion; tieneImagen: boolean }) {
  const imagen = useImagenCertificado(elemento, tieneImagen);
  const subir = useSubirImagenCertificado();
  const quitar = useQuitarImagenCertificado();
  const entrada = useRef<HTMLInputElement>(null);
  const error = subir.error ?? quitar.error;

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-soft p-3">
        {tieneImagen && imagen.data ? <img src={imagen.data} alt={ETIQUETA_ELEMENTO[elemento]} className="max-h-24 max-w-full object-contain" /> : <span className="text-xs text-muted">{tieneImagen ? 'Cargando…' : 'Sin imagen cargada'}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subir.mutate({ elemento, archivo });
            e.target.value = '';
          }}
        />
        <Button variant="soft-edit" className="px-3 py-1 text-xs" isLoading={subir.isPending} onClick={() => entrada.current?.click()}>
          {tieneImagen ? 'Reemplazar' : 'Cargar imagen'}
        </Button>
        {tieneImagen && (
          <Button variant="soft-danger" className="px-3 py-1 text-xs" isLoading={quitar.isPending} onClick={() => quitar.mutate(elemento)}>
            Quitar
          </Button>
        )}
        <span className="text-xs text-muted">PNG (mejor con fondo transparente) o JPG, hasta 500 KB.</span>
      </div>
    </div>
  );
}

function PoliticaTabla({ configuracion, onCambio, deshabilitado }: { configuracion: ConfiguracionCertificados; onCambio: (clave: string, elemento: ElementoAutenticacion, modo: ModoElemento) => void; deshabilitado: boolean }) {
  return (
    <Table>
      <TableHead>
        <tr>
          <Th>Documento</Th>
          {ELEMENTOS_AUTENTICACION.map((e) => (
            <Th key={e}>{ETIQUETA_ELEMENTO[e]}</Th>
          ))}
        </tr>
      </TableHead>
      <TableBody>
        {configuracion.tipos.map((t) => (
          <tr key={t.clave}>
            <Td className="font-semibold text-ink">{t.nombre}</Td>
            {ELEMENTOS_AUTENTICACION.map((e) => (
              <Td key={e}>
                <Select label={`${t.nombre}: ${ETIQUETA_ELEMENTO[e]}`} hideLabel value={configuracion.politica[t.clave][e]} disabled={deshabilitado} onChange={(ev) => onCambio(t.clave, e, ev.target.value as ModoElemento)}>
                  {MODOS_ELEMENTO.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nombre}
                    </option>
                  ))}
                </Select>
              </Td>
            ))}
          </tr>
        ))}
        {configuracion.tipos.length === 0 && <EmptyRow colSpan={4}>Sin documentos configurables.</EmptyRow>}
      </TableBody>
    </Table>
  );
}
