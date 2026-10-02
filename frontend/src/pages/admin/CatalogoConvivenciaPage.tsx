import { type FormEvent, useState } from 'react';
import { CargaMasivaDrawer } from '../../components/convivencia/CargaMasivaDrawer';
import { EntidadesTab, MedidasTab, ProtocolosTab } from '../../components/convivencia/CatalogosCasoTabs';
import type { ProcesoConvivencia } from '../../lib/columnasImportacion';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon, UploadIcon } from '../../components/ui/icons';
import {
  FAMILIAS_OBSERVACION,
  NOMBRES_FAMILIA,
  TIPOS_SITUACION,
  type CategoriaDescriptor,
  type Descriptor,
  type FamiliaObservacion,
  type RecursoCatalogo,
  type TipoObservacion,
  type TipoSituacion,
  useActualizarCategoriaDescriptor,
  useActualizarConfiguracionConvivencia,
  useActualizarDescriptor,
  useActualizarTipoObservacion,
  useCambiarEstadoCatalogo,
  useCatalogoConvivencia,
  useConfiguracionConvivencia,
  useCrearCategoriaDescriptor,
  useCrearDescriptor,
  useCrearTipoObservacion,
  useEliminarDelCatalogo,
} from '../../hooks/useObservaciones';
import type { EstadoActivo } from '../../types/domain';

const TONO_SITUACION: Record<TipoSituacion, Tone> = { I: 'blue', II: 'orange', III: 'red' };

interface PorEliminar {
  recurso: RecursoCatalogo;
  id: string;
  nombre: string;
}

export function CatalogoConvivenciaPage() {
  const catalogo = useCatalogoConvivencia(true);
  const [tab, setTab] = useState('tipos');
  const cambiarEstado = useCambiarEstadoCatalogo();
  const eliminar = useEliminarDelCatalogo();
  const [porEliminar, setPorEliminar] = useState<PorEliminar | null>(null);
  const [carga, setCarga] = useState<ProcesoConvivencia | null>(null);
  const procesoDeCarga = tab === 'tipos' || tab === 'categorias' ? tab : tab === 'frases' ? 'frases' : null;

  const alternarEstado = (recurso: RecursoCatalogo, id: string, estado: EstadoActivo) =>
    cambiarEstado.mutate({ recurso, id, estado: estado === 'activo' ? 'inactivo' : 'activo' });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de convivencia"
        subtitle="Los tipos de observación, las categorías y las faltas de tu manual de convivencia. Cada institución define los suyos."
        action={
          procesoDeCarga ? (
            <Button variant="outline" onClick={() => setCarga(procesoDeCarga)}>
              <UploadIcon className="h-4 w-4" /> Cargar archivo
            </Button>
          ) : undefined
        }
      />
      <CargaMasivaDrawer proceso={carga} onClose={() => setCarga(null)} />
      <Alert tone="info">
        Agrega, edita o elimina lo que necesites. Lo que ya se usó en una observación no se elimina: se desactiva, para conservar el historial.
      </Alert>
      {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}

      <Tabs
        items={[
          { key: 'tipos', label: 'Tipos de observación' },
          { key: 'categorias', label: 'Categorías' },
          { key: 'frases', label: 'Frases y faltas' },
          { key: 'medidas', label: 'Medidas' },
          { key: 'entidades', label: 'Entidades de remisión' },
          { key: 'protocolos', label: 'Protocolos' },
          { key: 'politica', label: 'Plazos' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {catalogo.isLoading && <Spinner />}
      {catalogo.isError && <Alert tone="error">{errorMessage(catalogo.error)}</Alert>}
      {catalogo.data && (
        <>
          <TabPanel active={tab} tabKey="tipos">
            <TiposTab tipos={catalogo.data.tipos} onEstado={alternarEstado} onEliminar={setPorEliminar} />
          </TabPanel>
          <TabPanel active={tab} tabKey="categorias">
            <CategoriasTab categorias={catalogo.data.categorias} onEstado={alternarEstado} onEliminar={setPorEliminar} />
          </TabPanel>
          <TabPanel active={tab} tabKey="frases">
            <FrasesTab
              tipos={catalogo.data.tipos}
              categorias={catalogo.data.categorias}
              descriptores={catalogo.data.descriptores}
              onEstado={alternarEstado}
              onEliminar={setPorEliminar}
            />
          </TabPanel>
        </>
      )}
      <TabPanel active={tab} tabKey="medidas">
        <MedidasTab />
      </TabPanel>
      <TabPanel active={tab} tabKey="entidades">
        <EntidadesTab />
      </TabPanel>
      <TabPanel active={tab} tabKey="protocolos">
        <ProtocolosTab />
      </TabPanel>
      <TabPanel active={tab} tabKey="politica">
        <PoliticaTab />
      </TabPanel>

      <Drawer
        open={Boolean(porEliminar)}
        title="Eliminar del catálogo"
        subtitle={porEliminar?.nombre}
        onClose={() => {
          setPorEliminar(null);
          eliminar.reset();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!porEliminar) return;
          await eliminar.mutateAsync({ recurso: porEliminar.recurso, id: porEliminar.id });
          setPorEliminar(null);
        }}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        <Alert tone="warning">
          Esta acción no se puede deshacer. Si ya se usó en observaciones, el sistema no lo elimina: desactívalo.
        </Alert>
      </Drawer>
    </div>
  );
}

interface AccionesProps {
  onEstado: (recurso: RecursoCatalogo, id: string, estado: EstadoActivo) => void;
  onEliminar: (e: PorEliminar) => void;
}

function Acciones({
  recurso,
  id,
  nombre,
  estado,
  onEditar,
  onEstado,
  onEliminar,
}: AccionesProps & { recurso: RecursoCatalogo; id: string; nombre: string; estado: EstadoActivo; onEditar: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={onEditar} />
      <IconButton
        tone={estado === 'activo' ? 'neutral' : 'success'}
        label={estado === 'activo' ? 'Desactivar' : 'Reactivar'}
        icon={estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
        onClick={() => onEstado(recurso, id, estado)}
      />
      <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => onEliminar({ recurso, id, nombre })} />
    </div>
  );
}

// --- Tipos ---

function TiposTab({ tipos, onEstado, onEliminar }: { tipos: TipoObservacion[] } & AccionesProps) {
  const [drawer, setDrawer] = useState<{ tipo: TipoObservacion | null } | null>(null);
  return (
    <Card>
      <CardHeader
        title="Tipos de observación"
        subtitle="La familia define qué exige el sistema (la disciplinaria exige describir los hechos) y no se cambia después de crear el tipo."
        action={
          <Button onClick={() => setDrawer({ tipo: null })}>
            <PlusIcon className="h-4 w-4" /> Nuevo tipo
          </Button>
        }
      />
      <Table>
        <TableHead>
          <tr>
            <Th>Nombre</Th>
            <Th>Familia</Th>
            <Th>Lo ve el estudiante</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {tipos.map((t) => (
            <tr key={t._id}>
              <Td>{t.nombre}</Td>
              <Td>
                <Chip tone="neutral">{NOMBRES_FAMILIA[t.familia]}</Chip>
              </Td>
              <Td>{t.visible_estudiante ? 'Sí' : 'No'}</Td>
              <Td>
                <EstadoUsuarioBadge value={t.estado} />
              </Td>
              <Td>
                <Acciones recurso="tipos" id={t._id} nombre={t.nombre} estado={t.estado} onEditar={() => setDrawer({ tipo: t })} onEstado={onEstado} onEliminar={onEliminar} />
              </Td>
            </tr>
          ))}
          {tipos.length === 0 && <EmptyRow colSpan={5}>Sin tipos.</EmptyRow>}
        </TableBody>
      </Table>
      {drawer && <TipoDrawer tipo={drawer.tipo} onClose={() => setDrawer(null)} />}
    </Card>
  );
}

function TipoDrawer({ tipo, onClose }: { tipo: TipoObservacion | null; onClose: () => void }) {
  const crear = useCrearTipoObservacion();
  const actualizar = useActualizarTipoObservacion();
  const mutation = tipo ? actualizar : crear;
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [familia, setFamilia] = useState<FamiliaObservacion>(tipo?.familia ?? 'COMPORTAMENTAL');
  const [visible, setVisible] = useState(tipo?.visible_estudiante ?? false);
  const [orden, setOrden] = useState(String(tipo?.orden ?? 0));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const datos = { nombre, visible_estudiante: visible, orden: Number(orden) || 0 };
    if (tipo) await actualizar.mutateAsync({ id: tipo._id, ...datos });
    else await crear.mutateAsync({ ...datos, familia });
    onClose();
  };

  return (
    <Drawer open title={tipo ? 'Editar tipo' : 'Nuevo tipo de observación'} onClose={onClose} onSubmit={guardar} isSubmitting={mutation.isPending} submitDisabled={!nombre.trim()}>
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required />
      <Select label="Familia" value={familia} onChange={(e) => setFamilia(e.target.value as FamiliaObservacion)} disabled={Boolean(tipo)}>
        {FAMILIAS_OBSERVACION.map((f) => (
          <option key={f} value={f}>
            {NOMBRES_FAMILIA[f]}
          </option>
        ))}
      </Select>
      <label className="flex items-start gap-2 text-sm text-body">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        <span>
          El estudiante puede ver estas observaciones
          <span className="block text-xs text-muted">Aplica a las que se registren desde ahora; las anteriores conservan lo que tenían.</span>
        </span>
      </label>
      <Input label="Orden" type="number" min={0} value={orden} onChange={(e) => setOrden(e.target.value)} />
    </Drawer>
  );
}

// --- Categorías ---

function CategoriasTab({ categorias, onEstado, onEliminar }: { categorias: CategoriaDescriptor[] } & AccionesProps) {
  const [drawer, setDrawer] = useState<{ categoria: CategoriaDescriptor | null } | null>(null);
  return (
    <Card>
      <CardHeader
        title="Categorías"
        subtitle="Agrupan las frases, por ejemplo «Compromisos académicos» o «Filosofía institucional»."
        action={
          <Button onClick={() => setDrawer({ categoria: null })}>
            <PlusIcon className="h-4 w-4" /> Nueva categoría
          </Button>
        }
      />
      <Table>
        <TableHead>
          <tr>
            <Th>Nombre</Th>
            <Th>Orden</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {categorias.map((c) => (
            <tr key={c._id}>
              <Td>{c.nombre}</Td>
              <Td>{c.orden}</Td>
              <Td>
                <EstadoUsuarioBadge value={c.estado} />
              </Td>
              <Td>
                <Acciones recurso="categorias" id={c._id} nombre={c.nombre} estado={c.estado} onEditar={() => setDrawer({ categoria: c })} onEstado={onEstado} onEliminar={onEliminar} />
              </Td>
            </tr>
          ))}
          {categorias.length === 0 && <EmptyRow colSpan={4}>Aún no hay categorías.</EmptyRow>}
        </TableBody>
      </Table>
      {drawer && <CategoriaDrawer categoria={drawer.categoria} onClose={() => setDrawer(null)} />}
    </Card>
  );
}

function CategoriaDrawer({ categoria, onClose }: { categoria: CategoriaDescriptor | null; onClose: () => void }) {
  const crear = useCrearCategoriaDescriptor();
  const actualizar = useActualizarCategoriaDescriptor();
  const mutation = categoria ? actualizar : crear;
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [orden, setOrden] = useState(String(categoria?.orden ?? 0));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const datos = { nombre, orden: Number(orden) || 0 };
    if (categoria) await actualizar.mutateAsync({ id: categoria._id, ...datos });
    else await crear.mutateAsync(datos);
    onClose();
  };

  return (
    <Drawer open title={categoria ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose} onSubmit={guardar} isSubmitting={mutation.isPending} submitDisabled={!nombre.trim()}>
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required />
      <Input label="Orden" type="number" min={0} value={orden} onChange={(e) => setOrden(e.target.value)} />
    </Drawer>
  );
}

// --- Frases y faltas ---

function FrasesTab({
  tipos,
  categorias,
  descriptores,
  onEstado,
  onEliminar,
}: { tipos: TipoObservacion[]; categorias: CategoriaDescriptor[]; descriptores: Descriptor[] } & AccionesProps) {
  const [tipoId, setTipoId] = useState('');
  const tipoActual = tipos.find((t) => t._id === (tipoId || tipos[0]?._id));
  const [drawer, setDrawer] = useState<{ descriptor: Descriptor | null } | null>(null);
  const filas = descriptores.filter((d) => d.tipo_id === tipoActual?._id);
  const nombreCategoria = (id: string | null) => categorias.find((c) => c._id === id)?.nombre ?? '—';
  const esFalta = tipoActual?.familia === 'DISCIPLINARIA';

  return (
    <Card>
      <CardHeader
        title="Frases y faltas"
        subtitle={esFalta ? 'En un tipo disciplinario cada frase es una falta de tu manual, con su código y su tipo de situación.' : 'Frases que el docente puede marcar al registrar.'}
        action={
          <Button disabled={!tipoActual} onClick={() => setDrawer({ descriptor: null })}>
            <PlusIcon className="h-4 w-4" /> Nueva frase
          </Button>
        }
      />
      <div className="p-4">
        <Select label="Tipo de observación" value={tipoActual?._id ?? ''} onChange={(e) => setTipoId(e.target.value)}>
          {tipos.map((t) => (
            <option key={t._id} value={t._id}>
              {t.nombre}
            </option>
          ))}
        </Select>
      </div>
      <Table>
        <TableHead>
          <tr>
            <Th>Código</Th>
            <Th>Texto</Th>
            <Th>Categoría</Th>
            {esFalta && <Th>Situación</Th>}
            {esFalta && <Th>Décimas</Th>}
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {filas.map((d) => (
            <tr key={d._id}>
              <Td>{d.codigo ?? '—'}</Td>
              <Td className="max-w-md">{d.texto}</Td>
              <Td>{nombreCategoria(d.categoria_id)}</Td>
              {esFalta && <Td>{d.tipo_situacion ? <Chip tone={TONO_SITUACION[d.tipo_situacion]}>Tipo {d.tipo_situacion}</Chip> : '—'}</Td>}
              {esFalta && <Td>{d.descuento_decimas ?? '—'}</Td>}
              <Td>
                <EstadoUsuarioBadge value={d.estado} />
              </Td>
              <Td>
                <Acciones recurso="descriptores" id={d._id} nombre={d.codigo ?? d.texto.slice(0, 40)} estado={d.estado} onEditar={() => setDrawer({ descriptor: d })} onEstado={onEstado} onEliminar={onEliminar} />
              </Td>
            </tr>
          ))}
          {filas.length === 0 && <EmptyRow colSpan={esFalta ? 7 : 5}>Este tipo todavía no tiene frases.</EmptyRow>}
        </TableBody>
      </Table>
      {drawer && tipoActual && <DescriptorDrawer tipo={tipoActual} categorias={categorias} descriptor={drawer.descriptor} onClose={() => setDrawer(null)} />}
    </Card>
  );
}

function DescriptorDrawer({
  tipo,
  categorias,
  descriptor,
  onClose,
}: {
  tipo: TipoObservacion;
  categorias: CategoriaDescriptor[];
  descriptor: Descriptor | null;
  onClose: () => void;
}) {
  const crear = useCrearDescriptor();
  const actualizar = useActualizarDescriptor();
  const mutation = descriptor ? actualizar : crear;
  const esFalta = tipo.familia === 'DISCIPLINARIA';
  const [codigo, setCodigo] = useState(descriptor?.codigo ?? '');
  const [texto, setTexto] = useState(descriptor?.texto ?? '');
  const [categoriaId, setCategoriaId] = useState(descriptor?.categoria_id ?? '');
  const [situacion, setSituacion] = useState<TipoSituacion | ''>(descriptor?.tipo_situacion ?? '');
  const [decimas, setDecimas] = useState(descriptor?.descuento_decimas?.toString() ?? '');
  const [orden, setOrden] = useState(String(descriptor?.orden ?? 0));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const datos = {
      categoria_id: categoriaId || null,
      codigo: codigo.trim() || null,
      texto,
      tipo_situacion: esFalta && situacion ? situacion : null,
      descuento_decimas: esFalta && decimas !== '' ? Number(decimas) : null,
      orden: Number(orden) || 0,
    };
    if (descriptor) await actualizar.mutateAsync({ id: descriptor._id, ...datos });
    else await crear.mutateAsync({ ...datos, tipo_id: tipo._id });
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title={descriptor ? 'Editar frase' : 'Nueva frase'}
      subtitle={tipo.nombre}
      onClose={onClose}
      onSubmit={guardar}
      isSubmitting={mutation.isPending}
      submitDisabled={!texto.trim()}
    >
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Código (opcional)" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} hint="Por ejemplo 2.15, como en tu manual." />
        <Select label="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c._id} value={c._id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </div>
      <Input label="Texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={400} required />
      {esFalta && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Tipo de situación" value={situacion} onChange={(e) => setSituacion(e.target.value as TipoSituacion | '')} hint="Lo asigna tu manual; el docente no lo decide.">
            <option value="">Sin tipificar</option>
            {TIPOS_SITUACION.map((t) => (
              <option key={t} value={t}>
                Tipo {t}
              </option>
            ))}
          </Select>
          <Input label="Décimas (opcional)" type="number" step="0.1" min={0} max={5} value={decimas} onChange={(e) => setDecimas(e.target.value)} hint="Solo se guarda; todavía no se descuenta de ninguna nota." />
        </div>
      )}
      <Input label="Orden" type="number" min={0} value={orden} onChange={(e) => setOrden(e.target.value)} />
    </Drawer>
  );
}

// --- Plazos ---

function PoliticaTab() {
  const configuracion = useConfiguracionConvivencia();
  const actualizar = useActualizarConfiguracionConvivencia();
  const [enmienda, setEnmienda] = useState<string | null>(null);
  const [anulacion, setAnulacion] = useState<string | null>(null);
  const [remision, setRemision] = useState<string | null>(null);
  const [quorum, setQuorum] = useState<string | null>(null);

  if (configuracion.isLoading) return <Spinner />;
  if (configuracion.isError) return <Alert tone="error">{errorMessage(configuracion.error)}</Alert>;
  const actual = configuracion.data;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await actualizar.mutateAsync({
      plazo_enmienda_horas: Number(enmienda ?? actual?.plazo_enmienda_horas),
      plazo_anulacion_horas: Number(anulacion ?? actual?.plazo_anulacion_horas),
      plazo_remision_tipo_iii_horas: Number(remision ?? actual?.plazo_remision_tipo_iii_horas),
      quorum_porcentaje: Number(quorum ?? actual?.quorum_porcentaje),
    });
    setEnmienda(null);
    setAnulacion(null);
    setRemision(null);
    setQuorum(null);
  };

  return (
    <Card>
      <CardHeader title="Plazos para corregir" subtitle="Pasado el plazo, solo coordinación o administración pueden enmendar o anular una observación." />
      <form onSubmit={guardar} className="space-y-4 p-4">
        {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
        {actualizar.isSuccess && <Alert tone="success">Plazos guardados.</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Horas para enmendar" type="number" min={0} max={720} value={enmienda ?? actual?.plazo_enmienda_horas ?? ''} onChange={(e) => setEnmienda(e.target.value)} />
          <Input label="Horas para anular" type="number" min={0} max={720} value={anulacion ?? actual?.plazo_anulacion_horas ?? ''} onChange={(e) => setAnulacion(e.target.value)} />
          <Input
            label="Horas para remitir un caso tipo III"
            type="number"
            min={0}
            max={720}
            value={remision ?? actual?.plazo_remision_tipo_iii_horas ?? ''}
            onChange={(e) => setRemision(e.target.value)}
            hint="Pasado este plazo sin remisión, el caso muestra una alerta."
          />
          <Input
            label="Quórum del comité (% de miembros presentes)"
            type="number"
            min={1}
            max={100}
            value={quorum ?? actual?.quorum_porcentaje ?? ''}
            onChange={(e) => setQuorum(e.target.value)}
            hint="Para firmar un acta y deliberar cada caso, sin contar a los recusados."
          />
        </div>
        <Button type="submit" isLoading={actualizar.isPending}>
          Guardar plazos
        </Button>
      </form>
    </Card>
  );
}
