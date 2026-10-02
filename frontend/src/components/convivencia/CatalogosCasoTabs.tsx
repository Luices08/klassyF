import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoUsuarioBadge, TipoSituacionBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon, XIcon } from '../ui/icons';
import {
  useCambiarEstadoCatalogoCaso,
  useCatalogosCaso,
  useEliminarCatalogoCaso,
  useGuardarCatalogoCaso,
  useGuardarProtocolo,
  type EntidadExterna,
  type MedidaConvivencia,
  type ProtocoloConvivencia,
  type RecursoCatalogoCaso,
} from '../../hooks/useCasos';
import { TIPOS_SITUACION, type TipoSituacion } from '../../hooks/useObservaciones';

type ItemSimple = MedidaConvivencia | EntidadExterna;

interface TabSimpleProps {
  recurso: RecursoCatalogoCaso;
  titulo: string;
  subtitulo: string;
  nuevo: string;
  items: ItemSimple[];
}

function TabSimple({ recurso, titulo, subtitulo, nuevo, items }: TabSimpleProps) {
  const [drawer, setDrawer] = useState<{ item: ItemSimple | null } | null>(null);
  const [eliminando, setEliminando] = useState<ItemSimple | null>(null);
  const cambiarEstado = useCambiarEstadoCatalogoCaso();
  const eliminar = useEliminarCatalogoCaso();

  return (
    <Card>
      <CardHeader
        title={titulo}
        subtitle={subtitulo}
        action={
          <Button onClick={() => setDrawer({ item: null })}>
            <PlusIcon className="h-4 w-4" /> {nuevo}
          </Button>
        }
      />
      {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}
      <Table>
        <TableHead>
          <tr>
            <Th>Nombre</Th>
            <Th>Descripción</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {items.map((i) => (
            <tr key={i._id}>
              <Td>
                {i.nombre}
                {'se_aplica_por_dias' in i && i.se_aplica_por_dias && <span className="ml-2 text-xs text-muted">(por días)</span>}
              </Td>
              <Td className="max-w-md">{i.descripcion || '—'}</Td>
              <Td>
                <EstadoUsuarioBadge value={i.estado} />
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setDrawer({ item: i })} />
                  <IconButton
                    tone={i.estado === 'activo' ? 'neutral' : 'success'}
                    label={i.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                    icon={i.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                    onClick={() => cambiarEstado.mutate({ recurso, id: i._id, estado: i.estado === 'activo' ? 'inactivo' : 'activo' })}
                  />
                  <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => setEliminando(i)} />
                </div>
              </Td>
            </tr>
          ))}
          {items.length === 0 && <EmptyRow colSpan={4}>Aún no hay registros: cada institución define los suyos.</EmptyRow>}
        </TableBody>
      </Table>
      {drawer && <ItemDrawer recurso={recurso} item={drawer.item} onClose={() => setDrawer(null)} />}
      <Drawer
        open={Boolean(eliminando)}
        title="Eliminar"
        subtitle={eliminando?.nombre}
        onClose={() => {
          setEliminando(null);
          eliminar.reset();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!eliminando) return;
          await eliminar.mutateAsync({ recurso, id: eliminando._id });
          setEliminando(null);
        }}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        <Alert tone="warning">Si ya se usó en algún caso, no se elimina: desactívalo para conservar el historial.</Alert>
      </Drawer>
    </Card>
  );
}

function ItemDrawer({ recurso, item, onClose }: { recurso: RecursoCatalogoCaso; item: ItemSimple | null; onClose: () => void }) {
  const guardarItem = useGuardarCatalogoCaso();
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? '');
  const [porDias, setPorDias] = useState(item && 'se_aplica_por_dias' in item ? item.se_aplica_por_dias : false);
  const [orden, setOrden] = useState(String(item?.orden ?? 0));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await guardarItem.mutateAsync({
      recurso,
      id: item?._id,
      nombre,
      descripcion,
      orden: Number(orden) || 0,
      ...(recurso === 'medidas' ? { se_aplica_por_dias: porDias } : {}),
    });
    onClose();
  };

  return (
    <Drawer open title={item ? 'Editar' : 'Nuevo'} onClose={onClose} onSubmit={guardar} isSubmitting={guardarItem.isPending} submitDisabled={!nombre.trim()}>
      {guardarItem.isError && <Alert tone="error">{errorMessage(guardarItem.error)}</Alert>}
      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} required />
      <Textarea label="Descripción" rows={3} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      {recurso === 'medidas' && (
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={porDias} onChange={(e) => setPorDias(e.target.checked)} />
          Se aplica por días (se pedirá la duración al registrarla)
        </label>
      )}
      <Input label="Orden" type="number" min={0} value={orden} onChange={(e) => setOrden(e.target.value)} />
    </Drawer>
  );
}

export function MedidasTab() {
  const catalogos = useCatalogosCaso(true);
  if (catalogos.isLoading) return <Spinner />;
  if (catalogos.isError) return <Alert tone="error">{errorMessage(catalogos.error)}</Alert>;
  return (
    <TabSimple
      recurso="medidas"
      titulo="Medidas pedagógicas y correctivas"
      subtitulo="Las de tu manual de convivencia: reparar el daño, trabajo social, taller, desescolarización…"
      nuevo="Nueva medida"
      items={catalogos.data?.medidas ?? []}
    />
  );
}

export function EntidadesTab() {
  const catalogos = useCatalogosCaso(true);
  if (catalogos.isLoading) return <Spinner />;
  if (catalogos.isError) return <Alert tone="error">{errorMessage(catalogos.error)}</Alert>;
  return (
    <TabSimple
      recurso="entidades"
      titulo="Entidades de remisión"
      subtitulo="A quién se remite un caso: ICBF, comisaría de familia, policía de infancia y adolescencia, salud…"
      nuevo="Nueva entidad"
      items={catalogos.data?.entidades ?? []}
    />
  );
}

// --- Protocolos ---

interface PasoEditable {
  nombre: string;
  obligatorio: boolean;
}

export function ProtocolosTab() {
  const catalogos = useCatalogosCaso(true);
  const [editando, setEditando] = useState<TipoSituacion | null>(null);
  if (catalogos.isLoading) return <Spinner />;
  if (catalogos.isError) return <Alert tone="error">{errorMessage(catalogos.error)}</Alert>;
  const protocolos = catalogos.data?.protocolos ?? [];
  const deTipo = (t: TipoSituacion) => protocolos.find((p) => p.tipo_situacion === t);

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Cada tipo de situación tiene su ruta de pasos. Se copia al abrir un caso: cambiar el protocolo no altera los casos que ya están en curso.
      </Alert>
      {TIPOS_SITUACION.map((t) => (
        <Card key={t}>
          <CardHeader
            title={`Protocolo de situación tipo ${t}`}
            action={
              <Button variant="soft-edit" onClick={() => setEditando(t)}>
                <PencilIcon className="h-4 w-4" /> Editar pasos
              </Button>
            }
          />
          <div className="space-y-2 p-4">
            <TipoSituacionBadge value={t} />
            {(deTipo(t)?.pasos ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin pasos definidos.</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-body">
                {deTipo(t)?.pasos.map((p) => (
                  <li key={p.orden}>
                    {p.nombre} {p.obligatorio && <span className="text-xs text-warning">(obligatorio)</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      ))}
      {editando && <ProtocoloDrawer tipo={editando} protocolo={deTipo(editando)} onClose={() => setEditando(null)} />}
    </div>
  );
}

function ProtocoloDrawer({ tipo, protocolo, onClose }: { tipo: TipoSituacion; protocolo?: ProtocoloConvivencia; onClose: () => void }) {
  const guardarProtocolo = useGuardarProtocolo();
  const [pasos, setPasos] = useState<PasoEditable[]>((protocolo?.pasos ?? []).map(({ nombre, obligatorio }) => ({ nombre, obligatorio })));

  const mover = (i: number, delta: number) =>
    setPasos((previa) => {
      const copia = [...previa];
      const destino = i + delta;
      if (destino < 0 || destino >= copia.length) return previa;
      [copia[i], copia[destino]] = [copia[destino]!, copia[i]!];
      return copia;
    });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await guardarProtocolo.mutateAsync({ tipo, pasos: pasos.filter((p) => p.nombre.trim()).map((p) => ({ nombre: p.nombre.trim(), obligatorio: p.obligatorio })) });
    onClose();
  };

  return (
    <Drawer open size="lg" title={`Protocolo tipo ${tipo}`} subtitle="Los pasos obligatorios deben estar cumplidos para poder cerrar el caso." onClose={onClose} onSubmit={guardar} isSubmitting={guardarProtocolo.isPending}>
      {guardarProtocolo.isError && <Alert tone="error">{errorMessage(guardarProtocolo.error)}</Alert>}
      {pasos.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-sm text-muted">{i + 1}.</span>
          <div className="flex-1">
            <Input label={`Paso ${i + 1}`} hideLabel value={p.nombre} onChange={(e) => setPasos((previa) => previa.map((x, n) => (n === i ? { ...x, nombre: e.target.value } : x)))} maxLength={200} placeholder="Descripción del paso" />
          </div>
          <label className="flex items-center gap-1 text-xs text-body">
            <input type="checkbox" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={p.obligatorio} onChange={(e) => setPasos((previa) => previa.map((x, n) => (n === i ? { ...x, obligatorio: e.target.checked } : x)))} />
            Obligatorio
          </label>
          <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => mover(i, -1)} disabled={i === 0}>
            ↑
          </Button>
          <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => mover(i, 1)} disabled={i === pasos.length - 1}>
            ↓
          </Button>
          <IconButton type="button" tone="danger" label="Quitar paso" icon={<XIcon />} onClick={() => setPasos((previa) => previa.filter((_, n) => n !== i))} />
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setPasos((previa) => [...previa, { nombre: '', obligatorio: false }])}>
        <PlusIcon className="h-4 w-4" /> Agregar paso
      </Button>
    </Drawer>
  );
}
