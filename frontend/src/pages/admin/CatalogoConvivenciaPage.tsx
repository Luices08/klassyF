import { type FormEvent, useState } from 'react';
import { CargaFaltasDrawer } from '../../components/convivencia/CargaFaltasDrawer';
import { EntidadesTab, MedidasTab, ProtocolosTab } from '../../components/convivencia/CatalogosCasoTabs';
import { useAuth } from '../../context/AuthContext';
import { useCambiarEstadoFalta, useEliminarFalta, useGuardarFalta } from '../../hooks/useCasos';
import { useInformeRetencion } from '../../hooks/useComite';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoUsuarioBadge, TipoSituacionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon, UploadIcon } from '../../components/ui/icons';
import {
  NOMBRES_GRAVEDAD,
  TIPOS_SITUACION,
  type FaltaConvivencia,
  type TipoObservacion,
  type TipoSituacion,
  useActualizarConfiguracionConvivencia,
  useActualizarTipoObservacion,
  useCambiarEstadoTipo,
  useCatalogoConvivencia,
  useConfiguracionConvivencia,
  useCrearTipoObservacion,
  useEliminarTipo,
} from '../../hooks/useObservaciones';
import type { EstadoActivo } from '../../types/domain';

interface PorEliminar {
  recurso: 'tipo' | 'falta';
  id: string;
  nombre: string;
}

export function CatalogoConvivenciaPage() {
  const catalogo = useCatalogoConvivencia(true);
  const [tab, setTab] = useState('tipos');
  const cambiarEstadoTipo = useCambiarEstadoTipo();
  const cambiarEstadoFalta = useCambiarEstadoFalta();
  const eliminarTipo = useEliminarTipo();
  const eliminarFalta = useEliminarFalta();
  const [porEliminar, setPorEliminar] = useState<PorEliminar | null>(null);
  const [cargando, setCargando] = useState(false);
  const eliminar = porEliminar?.recurso === 'falta' ? eliminarFalta : eliminarTipo;
  const errorEstado = cambiarEstadoTipo.isError ? cambiarEstadoTipo.error : cambiarEstadoFalta.isError ? cambiarEstadoFalta.error : null;

  const alternarEstado = (recurso: 'tipo' | 'falta', id: string, estado: EstadoActivo) => {
    const nuevo = estado === 'activo' ? 'inactivo' : 'activo';
    if (recurso === 'falta') cambiarEstadoFalta.mutate({ id, estado: nuevo });
    else cambiarEstadoTipo.mutate({ id, estado: nuevo });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de convivencia"
        subtitle="Los tipos de observación y las faltas de tu manual de convivencia, con sus medidas, protocolos y plazos. Cada institución define los suyos."
        action={
          tab === 'faltas' ? (
            <Button variant="outline" onClick={() => setCargando(true)}>
              <UploadIcon className="h-4 w-4" /> Cargar archivo
            </Button>
          ) : undefined
        }
      />
      <CargaFaltasDrawer open={cargando} onClose={() => setCargando(false)} />
      <Alert tone="info">
        Agrega, edita o elimina lo que necesites. Lo que ya se usó en un registro no se elimina: se desactiva, para conservar el historial.
      </Alert>
      {errorEstado && <Alert tone="error">{errorMessage(errorEstado)}</Alert>}

      <Tabs
        items={[
          { key: 'tipos', label: 'Tipos de observación' },
          { key: 'faltas', label: 'Faltas del manual' },
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
          <TabPanel active={tab} tabKey="faltas">
            <FaltasTab faltas={catalogo.data.faltas} onEstado={alternarEstado} onEliminar={setPorEliminar} />
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
          eliminarTipo.reset();
          eliminarFalta.reset();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!porEliminar) return;
          await eliminar.mutateAsync(porEliminar.id);
          setPorEliminar(null);
        }}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        <Alert tone="warning">
          Esta acción no se puede deshacer. Si ya se usó en algún registro, el sistema no lo elimina: desactívalo.
        </Alert>
      </Drawer>
    </div>
  );
}

interface AccionesProps {
  onEstado: (recurso: 'tipo' | 'falta', id: string, estado: EstadoActivo) => void;
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
}: AccionesProps & { recurso: 'tipo' | 'falta'; id: string; nombre: string; estado: EstadoActivo; onEditar: () => void }) {
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

// --- Tipos de observación ---

function TiposTab({ tipos, onEstado, onEliminar }: { tipos: TipoObservacion[] } & AccionesProps) {
  const [drawer, setDrawer] = useState<{ tipo: TipoObservacion | null } | null>(null);
  return (
    <Card>
      <CardHeader
        title="Tipos de observación"
        subtitle="Con qué clasifica el docente una observación cotidiana del Observador, por ejemplo «Académica» o «Comportamental»."
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
            <Th>Lo ve el estudiante</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {tipos.map((t) => (
            <tr key={t._id}>
              <Td>{t.nombre}</Td>
              <Td>{t.visible_estudiante ? 'Sí' : 'No'}</Td>
              <Td>
                <EstadoUsuarioBadge value={t.estado} />
              </Td>
              <Td>
                <Acciones recurso="tipo" id={t._id} nombre={t.nombre} estado={t.estado} onEditar={() => setDrawer({ tipo: t })} onEstado={onEstado} onEliminar={onEliminar} />
              </Td>
            </tr>
          ))}
          {tipos.length === 0 && <EmptyRow colSpan={4}>Sin tipos.</EmptyRow>}
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
  const [visible, setVisible] = useState(tipo?.visible_estudiante ?? false);
  const [orden, setOrden] = useState(String(tipo?.orden ?? 0));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const datos = { nombre, visible_estudiante: visible, orden: Number(orden) || 0 };
    if (tipo) await actualizar.mutateAsync({ id: tipo._id, ...datos });
    else await crear.mutateAsync(datos);
    onClose();
  };

  return (
    <Drawer open title={tipo ? 'Editar tipo' : 'Nuevo tipo de observación'} onClose={onClose} onSubmit={guardar} isSubmitting={mutation.isPending} submitDisabled={!nombre.trim()}>
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required />
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

// --- Faltas del manual (M15), agrupadas por gravedad ---

function FaltasTab({ faltas, onEstado, onEliminar }: { faltas: FaltaConvivencia[] } & AccionesProps) {
  const [drawer, setDrawer] = useState<{ falta: FaltaConvivencia | null } | null>(null);
  return (
    <Card>
      <CardHeader
        title="Faltas del manual"
        subtitle="Cada falta tiene la gravedad (Tipo I, II o III) que fija tu manual. El docente elige la falta y el tipo sale de ella."
        action={
          <Button onClick={() => setDrawer({ falta: null })}>
            <PlusIcon className="h-4 w-4" /> Nueva falta
          </Button>
        }
      />
      <Table>
        <TableHead>
          <tr>
            <Th>Código</Th>
            <Th>Descripción</Th>
            <Th>Décimas</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </TableHead>
        <TableBody>
          {TIPOS_SITUACION.map((gravedad) => {
            const filas = faltas.filter((f) => f.gravedad === gravedad);
            return (
              <FilasDeGravedad key={gravedad} gravedad={gravedad} filas={filas} onEstado={onEstado} onEliminar={onEliminar} onEditar={(falta) => setDrawer({ falta })} />
            );
          })}
        </TableBody>
      </Table>
      {drawer && <FaltaCatalogoDrawer falta={drawer.falta} onClose={() => setDrawer(null)} />}
    </Card>
  );
}

function FilasDeGravedad({
  gravedad,
  filas,
  onEditar,
  onEstado,
  onEliminar,
}: AccionesProps & { gravedad: TipoSituacion; filas: FaltaConvivencia[]; onEditar: (f: FaltaConvivencia) => void }) {
  return (
    <>
      <tr className="bg-soft">
        <Td colSpan={5}>
          <span className="flex items-center gap-2">
            <TipoSituacionBadge value={gravedad} />
            <span className="text-xs text-muted">
              {NOMBRES_GRAVEDAD[gravedad]} · {filas.length} falta(s)
            </span>
          </span>
        </Td>
      </tr>
      {filas.map((f) => (
        <tr key={f._id}>
          <Td>{f.codigo}</Td>
          <Td className="max-w-md">{f.descripcion}</Td>
          <Td>{f.descuento_decimas ?? '—'}</Td>
          <Td>
            <EstadoUsuarioBadge value={f.estado} />
          </Td>
          <Td>
            <Acciones recurso="falta" id={f._id} nombre={`${f.codigo} · ${f.descripcion.slice(0, 40)}`} estado={f.estado} onEditar={() => onEditar(f)} onEstado={onEstado} onEliminar={onEliminar} />
          </Td>
        </tr>
      ))}
      {filas.length === 0 && <EmptyRow colSpan={5}>Sin faltas de este tipo.</EmptyRow>}
    </>
  );
}

function FaltaCatalogoDrawer({ falta, onClose }: { falta: FaltaConvivencia | null; onClose: () => void }) {
  const guardarFalta = useGuardarFalta();
  const [codigo, setCodigo] = useState(falta?.codigo ?? '');
  const [descripcion, setDescripcion] = useState(falta?.descripcion ?? '');
  const [gravedad, setGravedad] = useState<TipoSituacion>(falta?.gravedad ?? 'I');
  const [decimas, setDecimas] = useState(falta?.descuento_decimas?.toString() ?? '');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await guardarFalta.mutateAsync({
      id: falta?._id,
      codigo: codigo.trim(),
      descripcion,
      gravedad,
      descuento_decimas: decimas !== '' ? Number(decimas) : null,
    });
    onClose();
  };

  return (
    <Drawer
      open
      title={falta ? 'Editar falta' : 'Nueva falta'}
      onClose={onClose}
      onSubmit={guardar}
      isSubmitting={guardarFalta.isPending}
      submitDisabled={!codigo.trim() || !descripcion.trim()}
    >
      {guardarFalta.isError && <Alert tone="error">{errorMessage(guardarFalta.error)}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Código del manual" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} required hint="Por ejemplo 2.15, como en tu manual." />
        <Select label="Gravedad" value={gravedad} onChange={(e) => setGravedad(e.target.value as TipoSituacion)} hint="Lo fija tu manual; el docente no la decide.">
          {TIPOS_SITUACION.map((t) => (
            <option key={t} value={t}>
              {NOMBRES_GRAVEDAD[t]}
            </option>
          ))}
        </Select>
      </div>
      <Textarea label="Descripción" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400} required />
      <Input label="Décimas (opcional)" type="number" step="0.1" min={0} max={5} value={decimas} onChange={(e) => setDecimas(e.target.value)} hint="Solo se guarda; todavía no se descuenta de ninguna nota." />
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
  const [retObs, setRetObs] = useState<string | null>(null);
  const [retCasos, setRetCasos] = useState<string | null>(null);
  const esAdmin = useAuth().user?.rol === 'ADMIN';
  const informe = useInformeRetencion(esAdmin);

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
      ...(esAdmin
        ? {
            retencion_anios_observaciones: aAnios(retObs, actual?.retencion_anios_observaciones),
            retencion_anios_casos: aAnios(retCasos, actual?.retencion_anios_casos),
          }
        : {}),
    });
    setEnmienda(null);
    setAnulacion(null);
    setRemision(null);
    setQuorum(null);
    setRetObs(null);
    setRetCasos(null);
  };

  return (
    <Card>
      <CardHeader title="Plazos para corregir" subtitle="Pasado el plazo, solo coordinación o administración pueden enmendar o anular un registro." />
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
        {esAdmin && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-label text-ink">Conservación de los datos</p>
            <p className="text-xs text-muted">
              Años que la institución conserva observaciones y casos, según su tabla de retención documental. Vacío = sin plazo definido: el sistema no supone ninguno ni borra nada.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Años de las observaciones" type="number" min={1} max={100} value={retObs ?? actual?.retencion_anios_observaciones ?? ''} onChange={(e) => setRetObs(e.target.value)} />
              <Input label="Años de los casos (desde que se cierran)" type="number" min={1} max={100} value={retCasos ?? actual?.retencion_anios_casos ?? ''} onChange={(e) => setRetCasos(e.target.value)} />
            </div>
            {informe.data && (informe.data.observaciones || informe.data.casos) && (
              <Alert tone="warning">
                {informe.data.observaciones && <p>{informe.data.observaciones.total} observación(es) ya cumplieron su plazo de conservación.</p>}
                {informe.data.casos && (
                  <p>
                    {informe.data.casos.total} caso(s) cerrado(s) ya cumplieron su plazo
                    {informe.data.casos.casos.length > 0 ? `: ${informe.data.casos.casos.map((c) => c.codigo).join(', ')}` : ''}.
                  </p>
                )}
                <p className="mt-1 text-xs">{informe.data.nota}</p>
              </Alert>
            )}
            {informe.data && !informe.data.observaciones && !informe.data.casos && <p className="text-xs text-muted">No hay plazos definidos, así que no hay nada vencido.</p>}
          </div>
        )}
        <Button type="submit" isLoading={actualizar.isPending}>
          Guardar plazos
        </Button>
      </form>
    </Card>
  );
}

/** Vacío = sin plazo (null); un número = esos años. Si no se tocó el campo, queda como está. */
function aAnios(editado: string | null, actual: number | null | undefined): number | null {
  if (editado === null) return actual ?? null;
  return editado.trim() === '' ? null : Number(editado);
}
