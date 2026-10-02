import { type FormEvent, useState } from 'react';
import { SesionComiteDrawer } from '../../components/convivencia/SesionComiteDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  NOMBRES_TIPO_SESION,
  TIPOS_SESION,
  descargarActaPdf,
  useCambiarEstadoMiembro,
  useCrearSesion,
  useEliminarMiembro,
  useGuardarMiembro,
  useMiembrosComite,
  useSesionesComite,
  type MiembroComite,
  type TipoSesion,
} from '../../hooks/useComite';
import { useUsersPaginados } from '../../hooks/useUsers';
import { formatoFechaCalendario } from '../../lib/fechas';

/** Comité Escolar de Convivencia (M15): miembros por año, sesiones y actas. Solo convivencia accede. */
export function ComitePage() {
  const [tab, setTab] = useState('sesiones');
  return (
    <div className="space-y-4">
      <PageHeader title="Comité de convivencia" subtitle="Miembros del año, sesiones y actas. El acta firmada por el rector es inmutable." />
      <Tabs
        items={[
          { key: 'sesiones', label: 'Sesiones y actas' },
          { key: 'miembros', label: 'Miembros' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <TabPanel active={tab} tabKey="sesiones">
        <SesionesTab />
      </TabPanel>
      <TabPanel active={tab} tabKey="miembros">
        <MiembrosTab />
      </TabPanel>
    </div>
  );
}

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

function SesionesTab() {
  const sesiones = useSesionesComite();
  const [creando, setCreando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title={`Sesiones ${sesiones.data ? `del año ${sesiones.data.anio.year}` : ''}`}
        subtitle="Cada sesión parte de los miembros activos del año; al firmarla se le asigna el consecutivo del acta."
        action={
          <Button onClick={() => setCreando(true)}>
            <PlusIcon className="h-4 w-4" /> Nueva sesión
          </Button>
        }
      />
      {sesiones.isLoading && <Spinner />}
      {sesiones.isError && <Alert tone="error">{errorMessage(sesiones.error)}</Alert>}
      {sesiones.data && (
        <Table>
          <TableHead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Acta</Th>
              <Th>Quórum</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {sesiones.data.sesiones.map((s) => (
              <tr key={s._id} className={s.estado === 'ANULADA' ? 'opacity-60' : ''}>
                <Td>{formatoFechaCalendario(s.fecha)}</Td>
                <Td>{NOMBRES_TIPO_SESION[s.tipo]}</Td>
                <Td>
                  {s.estado === 'FIRMADA' ? <Chip tone="green">{s.codigo}</Chip> : s.estado === 'ANULADA' ? <Chip tone="neutral">Anulada</Chip> : <Chip tone="orange">Borrador</Chip>}
                </Td>
                <Td>
                  {s.quorum.presentes} de {s.quorum.total_miembros}
                </Td>
                <Td className="text-right">
                  <span className="flex justify-end gap-2">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setAbierta(s._id)}>
                      Abrir
                    </Button>
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => void descargarActaPdf(s._id, `${s.codigo ?? 'borrador-acta'}.pdf`)}>
                      PDF
                    </Button>
                  </span>
                </Td>
              </tr>
            ))}
            {sesiones.data.sesiones.length === 0 && <EmptyRow colSpan={5}>Todavía no hay sesiones este año.</EmptyRow>}
          </TableBody>
        </Table>
      )}
      <NuevaSesionDrawer open={creando} onClose={() => setCreando(false)} onCreada={setAbierta} />
      <SesionComiteDrawer sesionId={abierta} onClose={() => setAbierta(null)} />
    </Card>
  );
}

function NuevaSesionDrawer({ open, onClose, onCreada }: { open: boolean; onClose: () => void; onCreada: (id: string) => void }) {
  if (!open) return null;
  return <FormularioSesion onClose={onClose} onCreada={onCreada} />;
}

function FormularioSesion({ onClose, onCreada }: { onClose: () => void; onCreada: (id: string) => void }) {
  const crear = useCrearSesion();
  const [tipo, setTipo] = useState<TipoSesion>('ORDINARIA');
  const [fecha, setFecha] = useState(hoyLocal());
  const [hora, setHora] = useState('');
  const [lugar, setLugar] = useState('');
  const [orden, setOrden] = useState('');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const sesion = await crear.mutateAsync({ tipo, fecha, hora: hora || undefined, lugar, orden_del_dia: orden });
    onCreada(sesion._id);
    onClose();
  };

  return (
    <Drawer open title="Nueva sesión del comité" subtitle="El acta se levanta de una sesión ya realizada." onClose={onClose} onSubmit={guardar} submitLabel="Crear borrador" isSubmitting={crear.isPending}>
      {crear.isError && <Alert tone="error">{errorMessage(crear.error)}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSesion)}>
          {TIPOS_SESION.map((t) => (
            <option key={t} value={t}>
              {NOMBRES_TIPO_SESION[t]}
            </option>
          ))}
        </Select>
        <Input label="Fecha" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        <Input label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        <Input label="Lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={200} />
      </div>
      <Textarea label="Orden del día" rows={4} maxLength={3000} value={orden} onChange={(e) => setOrden(e.target.value)} />
    </Drawer>
  );
}

// --- Miembros ---

function MiembrosTab() {
  const miembros = useMiembrosComite(true);
  const [drawer, setDrawer] = useState<{ miembro: MiembroComite | null } | null>(null);
  const [eliminando, setEliminando] = useState<MiembroComite | null>(null);
  const cambiarEstado = useCambiarEstadoMiembro();
  const eliminar = useEliminarMiembro();

  return (
    <Card>
      <CardHeader
        title={`Miembros ${miembros.data ? `del año ${miembros.data.anio.year}` : ''}`}
        subtitle="Usuarios del sistema o designaciones externas (personero estudiantil, representante de los padres…). Un miembro vinculado a un usuario se aparta solo de los casos en que ese usuario se declare impedido."
        action={
          <Button onClick={() => setDrawer({ miembro: null })}>
            <PlusIcon className="h-4 w-4" /> Nuevo miembro
          </Button>
        }
      />
      {miembros.isLoading && <Spinner />}
      {miembros.isError && <Alert tone="error">{errorMessage(miembros.error)}</Alert>}
      {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}
      {miembros.data && (
        <Table>
          <TableHead>
            <tr>
              <Th>Nombre</Th>
              <Th>Cargo</Th>
              <Th>Vínculo</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {miembros.data.miembros.map((m) => (
              <tr key={m._id}>
                <Td>
                  {m.nombre} {m.es_presidente && <Chip tone="blue">Preside</Chip>}
                </Td>
                <Td>{m.cargo}</Td>
                <Td>{m.usuario_id ? 'Usuario del sistema' : 'Designación externa'}</Td>
                <Td>
                  <EstadoUsuarioBadge value={m.estado} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setDrawer({ miembro: m })} />
                    <IconButton
                      tone={m.estado === 'activo' ? 'neutral' : 'success'}
                      label={m.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                      icon={m.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                      onClick={() => cambiarEstado.mutate({ id: m._id, estado: m.estado === 'activo' ? 'inactivo' : 'activo' })}
                    />
                    <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => setEliminando(m)} />
                  </div>
                </Td>
              </tr>
            ))}
            {miembros.data.miembros.length === 0 && <EmptyRow colSpan={5}>Aún no hay miembros: se designan por año lectivo.</EmptyRow>}
          </TableBody>
        </Table>
      )}
      {drawer && <MiembroDrawer miembro={drawer.miembro} onClose={() => setDrawer(null)} />}
      <Drawer
        open={Boolean(eliminando)}
        title="Eliminar miembro"
        subtitle={eliminando?.nombre}
        onClose={() => {
          setEliminando(null);
          eliminar.reset();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!eliminando) return;
          await eliminar.mutateAsync(eliminando._id);
          setEliminando(null);
        }}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        <Alert tone="warning">Si figura en alguna acta, no se elimina: desactívalo para conservar el historial.</Alert>
      </Drawer>
    </Card>
  );
}

/** Solo el administrador puede ver la lista de usuarios (M02): coordinación designa externos o pide el vínculo a un ADMIN. */
function SelectorUsuario({ valor, onCambio }: { valor: string; onCambio: (id: string, nombre: string) => void }) {
  const usuarios = useUsersPaginados({ roles: ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'DOCENTE'], estado: 'activo', limit: 100 });
  return (
    <Select
      label="Vincular a un usuario del sistema (opcional)"
      value={valor}
      onChange={(e) => {
        const u = usuarios.data?.data.find((x) => x._id === e.target.value);
        onCambio(e.target.value, u ? `${u.nombre} ${u.apellido}` : '');
      }}
      hint="Si lo vinculas, el nombre sale de su cuenta y se aparta solo de los casos en que se declare impedido."
    >
      <option value="">Designación externa</option>
      {(usuarios.data?.data ?? []).map((u) => (
        <option key={u._id} value={u._id}>
          {u.nombre} {u.apellido}
        </option>
      ))}
    </Select>
  );
}

function MiembroDrawer({ miembro, onClose }: { miembro: MiembroComite | null; onClose: () => void }) {
  const { user } = useAuth();
  const guardarMiembro = useGuardarMiembro();
  const [cargo, setCargo] = useState(miembro?.cargo ?? '');
  const [nombre, setNombre] = useState(miembro?.nombre ?? '');
  const [documento, setDocumento] = useState(miembro?.documento ?? '');
  const [presidente, setPresidente] = useState(miembro?.es_presidente ?? false);
  const [usuarioId, setUsuarioId] = useState(miembro?.usuario_id ?? '');

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await guardarMiembro.mutateAsync({
      id: miembro?._id,
      cargo,
      es_presidente: presidente,
      ...(usuarioId ? { usuario_id: usuarioId } : { nombre, documento, usuario_id: null }),
    });
    onClose();
  };

  return (
    <Drawer open title={miembro ? 'Editar miembro' : 'Nuevo miembro'} onClose={onClose} onSubmit={guardar} isSubmitting={guardarMiembro.isPending} submitDisabled={!cargo.trim() || (!usuarioId && !nombre.trim())}>
      {guardarMiembro.isError && <Alert tone="error">{errorMessage(guardarMiembro.error)}</Alert>}
      <Input label="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} required placeholder="Rector, personero estudiantil, representante de padres…" />
      {user?.rol === 'ADMIN' && <SelectorUsuario valor={usuarioId} onCambio={(id, n) => { setUsuarioId(id); if (n) setNombre(n); }} />}
      {!usuarioId && (
        <>
          <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required />
          <Input label="Documento (opcional)" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={30} />
        </>
      )}
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={presidente} onChange={(e) => setPresidente(e.target.checked)} />
        Preside el comité (solo uno por año)
      </label>
    </Drawer>
  );
}
