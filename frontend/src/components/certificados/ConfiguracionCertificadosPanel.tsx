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
  type DependenciaPazYSalvo,
  type ElementoAutenticacion,
  type ModoElemento,
} from '../../hooks/useCertificados';
import { useUsers } from '../../hooks/useUsers';

/**
 * Quién firma los certificados, con qué imágenes y qué se estampa por defecto en cada documento.
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
        <FirmanteCard titulo="Rectoría" elemento="rectoria" rol="ADMIN" firmante={c.rectoria} puedeDesignar={c.puede.designar.rectoria} puedeImagen={c.puede.imagen.rectoria} />
        <FirmanteCard titulo="Secretaría Académica" elemento="secretaria" rol="SECRETARIA" firmante={c.secretaria} puedeDesignar={c.puede.designar.secretaria} puedeImagen={c.puede.imagen.secretaria} />
      </div>

      <Card>
        <CardHeader title="Sello institucional" />
        <ImagenCard elemento="sello" tieneImagen={c.sello.tiene_imagen} faltante={c.sello.imagen_faltante} puedeEditar={c.puede.imagen.sello} />
      </Card>

      <Card>
        <CardHeader title="Qué se estampa en cada documento" subtitle="El valor de partida del switch al expedir, y si se puede cambiar. El QR y la huella van siempre." />
        <PoliticaTabla configuracion={c} onCambio={(clave, elemento, modo) => actualizar.mutate({ politica: { [clave]: { [elemento]: modo } } })} deshabilitado={actualizar.isPending || !c.puede.ajustes} />
      </Card>

      <DependenciasCard dependencias={c.paz_y_salvo.dependencias} puedeEditar={c.puede.ajustes} />
    </div>
  );
}

function FirmanteCard({
  titulo,
  elemento,
  rol,
  firmante,
  puedeDesignar,
  puedeImagen,
}: {
  titulo: string;
  elemento: 'rectoria' | 'secretaria';
  rol: 'ADMIN' | 'SECRETARIA';
  firmante: ConfiguracionCertificados['rectoria'];
  puedeDesignar: boolean;
  puedeImagen: boolean;
}) {
  // Solo se piden los usuarios cuando quien está en sesión puede elegir entre ellos.
  const usuarios = useUsers({ rol, estado: 'activo' }, puedeDesignar);
  const actualizar = useActualizarConfiguracionCertificados();
  const [cargo, setCargo] = useState(firmante.cargo);

  return (
    <Card className="space-y-4">
      <CardHeader title={titulo} />
      {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
      {puedeDesignar ? (
        <Select label="Quién firma" value={firmante.usuario_id ?? ''} onChange={(e) => actualizar.mutate({ [elemento]: { usuario_id: e.target.value || null } })} disabled={actualizar.isPending || usuarios.isLoading}>
          <option value="">Sin designar</option>
          {usuarios.data?.map((u) => (
            <option key={u._id} value={u._id}>
              {u.nombre} {u.apellido}
            </option>
          ))}
        </Select>
      ) : (
        <p className="text-sm text-body">
          <span className="font-semibold text-ink">Quién firma: </span>
          {firmante.nombre ?? 'Sin designar'} <span className="text-xs text-muted">(lo designa el administrador)</span>
        </p>
      )}
      {puedeDesignar && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Cargo que se imprime" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} />
          </div>
          <Button variant="soft-edit" disabled={cargo.trim().length < 2 || cargo.trim() === firmante.cargo} isLoading={actualizar.isPending} onClick={() => actualizar.mutate({ [elemento]: { cargo: cargo.trim() } })}>
            Guardar
          </Button>
        </div>
      )}
      {!puedeDesignar && <p className="text-sm text-body">Cargo que se imprime: {firmante.cargo}</p>}
      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Imagen de la firma</p>
        <ImagenCard elemento={elemento} tieneImagen={firmante.tiene_imagen} faltante={firmante.imagen_faltante} puedeEditar={puedeImagen} />
      </div>
    </Card>
  );
}

function ImagenCard({ elemento, tieneImagen, faltante, puedeEditar }: { elemento: ElementoAutenticacion; tieneImagen: boolean; faltante: boolean; puedeEditar: boolean }) {
  // La imagen es de acceso autenticado y con permiso: sin él ni se pide.
  const imagen = useImagenCertificado(elemento, tieneImagen && puedeEditar && !faltante);
  const subir = useSubirImagenCertificado();
  const quitar = useQuitarImagenCertificado();
  const entrada = useRef<HTMLInputElement>(null);
  const error = subir.error ?? quitar.error;

  if (!puedeEditar) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-soft p-3 text-xs text-muted">
        {tieneImagen ? 'Hay una imagen cargada.' : 'Sin imagen cargada.'} No tienes permiso para cambiarla
        {elemento === 'rectoria' ? ': el administrador no ha delegado la firma de Rectoría en la secretaría.' : '.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {faltante && (
        <Alert tone="warning">
          El archivo de esta imagen no está en el servidor, así que no se puede estampar ni reimprimir con ella los documentos que ya la usaron. Vuelve a cargar la imagen original: se identifica por su contenido y los documentos anteriores vuelven a abrirse.
        </Alert>
      )}
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-soft p-3">
        {tieneImagen && imagen.data ? <img src={imagen.data} alt={ETIQUETA_ELEMENTO[elemento]} className="max-h-24 max-w-full object-contain" /> : <span className="text-xs text-muted">{faltante ? 'Archivo no encontrado' : tieneImagen ? 'Cargando…' : 'Sin imagen cargada'}</span>}
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
  // Un tipo archivado ya no se expide: su política no se configura.
  const tiposConPolitica = configuracion.tipos.filter((t) => t.estado !== 'ARCHIVADO' && configuracion.politica[t.clave]);
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
        {tiposConPolitica.map((t) => (
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
        {tiposConPolitica.length === 0 && <EmptyRow colSpan={4}>Sin documentos configurables.</EmptyRow>}
      </TableBody>
    </Table>
  );
}

/** Las dependencias que el colegio exige para el paz y salvo: se guardan como lista completa (lo que falta se elimina). */
function DependenciasCard({ dependencias, puedeEditar }: { dependencias: (DependenciaPazYSalvo & { clave: string })[]; puedeEditar: boolean }) {
  const actualizar = useActualizarConfiguracionCertificados();
  const [nueva, setNueva] = useState('');
  const guardar = (lista: DependenciaPazYSalvo[]) => actualizar.mutate({ paz_y_salvo: { dependencias: lista } });

  return (
    <Card className="space-y-4">
      <CardHeader title="Dependencias del paz y salvo" subtitle="Al expedir el paz y salvo se confirma, una por una, que el estudiante no tiene pendientes en las dependencias activas." />
      {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
      <div className="space-y-3">
        {dependencias.map((d) => (
          <div key={d.clave} className="flex items-center justify-between gap-3">
            <Switch
              label={d.nombre}
              checked={d.activa}
              onChange={(valor) => guardar(dependencias.map((x) => (x.clave === d.clave ? { ...x, activa: valor } : x)))}
              disabled={actualizar.isPending || !puedeEditar}
              disabledReason={puedeEditar ? null : 'Solo el administrador cambia las dependencias.'}
            />
            {puedeEditar && (
              <Button variant="soft-danger" className="px-3 py-1 text-xs" disabled={actualizar.isPending} onClick={() => guardar(dependencias.filter((x) => x.clave !== d.clave))}>
                Quitar
              </Button>
            )}
          </div>
        ))}
        {dependencias.length === 0 && <p className="text-sm text-muted">No hay dependencias: sin ellas no se puede expedir un paz y salvo.</p>}
      </div>
      {puedeEditar && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Nueva dependencia" value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={60} placeholder="Ej. Cafetería, Bienestar estudiantil" />
          </div>
          <Button
            variant="soft-edit"
            disabled={nueva.trim().length < 2}
            isLoading={actualizar.isPending}
            onClick={() => {
              guardar([...dependencias, { nombre: nueva.trim(), activa: true }]);
              setNueva('');
            }}
          >
            Agregar
          </Button>
        </div>
      )}
    </Card>
  );
}
