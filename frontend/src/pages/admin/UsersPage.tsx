import { type FormEvent, useEffect, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge, RolBadge, ROL_LABELS } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { MultiSelect } from '../../components/ui/MultiSelect';
import { GuiaColumnas } from '../../components/ui/GuiaColumnas';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import {
  BanIcon,
  KeyIcon,
  LogOutIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from '../../components/ui/icons';
import { COLUMNAS_USUARIOS, NOTAS_CSV_USUARIOS } from '../../lib/columnasImportacion';
import { useAuth } from '../../context/AuthContext';
import { useCampuses } from '../../hooks/useCatalogs';
import { useInstitution } from '../../hooks/useInstitution';
import {
  useActualizarEstadoUsuario,
  useBulkImportUsers,
  useCerrarSesiones,
  useCreateUser,
  useEliminarUsuario,
  useResetearPassword,
  useUpdateUser,
  useUsersPaginados,
  type CreateUserInput,
  type UpdateUserInput,
} from '../../hooks/useUsers';
import { ROLES, type Rol, puedeGestionarRol } from '../../types/api';
import { TIPOS_DOCUMENTO, type TipoDocumento, type User } from '../../types/domain';

const DEFAULT_ROLES_FILTRO: Rol[] = ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'DOCENTE', 'SECRETARIA'];
const PAGE_SIZE = 20;

const EMPTY_FORM: CreateUserInput = {
  nombre: '',
  apellido: '',
  tipo_documento: 'CC',
  numero_documento: '',
  email: '',
  telefono: '',
  password: '',
  rol: 'ESTUDIANTE',
  sedes_ids: [],
};

function sedeIdsDe(u: User): string[] {
  return u.sedes_ids.map((s) => (typeof s === 'string' ? s : s._id));
}

function userToEditForm(u: User): Omit<UpdateUserInput, 'id'> {
  return {
    nombre: u.nombre,
    apellido: u.apellido,
    tipo_documento: u.tipo_documento,
    numero_documento: u.numero_documento,
    email: u.email,
    telefono: u.telefono ?? '',
    rol: u.rol,
    sedes_ids: sedeIdsDe(u),
    password: '',
  };
}

/** Checkbox list de sedes autorizadas (M02): vacio = acceso global (uso tipico de ADMIN). */
function SedesCheckboxList({
  sedes,
  seleccionadas,
  onChange,
}: {
  sedes: Array<{ _id: string; nombre: string }>;
  seleccionadas: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(seleccionadas.includes(id) ? seleccionadas.filter((s) => s !== id) : [...seleccionadas, id]);
  }

  return (
    <div>
      <p className="mb-1.5 block text-label text-body">Sedes autorizadas</p>
      <p className="mb-2 text-xs text-muted">Déjalo vacío para acceso global (uso típico de ADMIN).</p>
      <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg ring-1 ring-inset ring-border p-3">
        {sedes.length === 0 && <p className="text-sm text-muted">No hay sedes registradas.</p>}
        {sedes.map((sede) => (
          <label key={sede._id} className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={seleccionadas.includes(sede._id)}
              onChange={() => toggle(sede._id)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            {sede.nombre}
          </label>
        ))}
      </div>
    </div>
  );
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';
  const sedesQuery = useCampuses(institucionId || undefined);
  const sedes = sedesQuery.data ?? [];

  const [filterRoles, setFilterRolesState] = useState<Rol[]>(DEFAULT_ROLES_FILTRO);
  const [filterSede, setFilterSedeState] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  function setFilterRoles(values: Rol[]) {
    setFilterRolesState(values);
    setPage(1);
  }

  function setFilterSede(value: string) {
    setFilterSedeState(value);
    setPage(1);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const usersQuery = useUsersPaginados({
    roles: filterRoles,
    sede_id: filterSede || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const createUser = useCreateUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);

  const assignableRoles = ROLES.filter((r) => currentUser && puedeGestionarRol(currentUser.rol, r));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.reset();
    await createUser.mutateAsync(form);
    setForm(EMPTY_FORM);
    setDrawerOpen(false);
  }

  const [usuarioEditando, setUsuarioEditando] = useState<User | null>(null);
  const [formEditar, setFormEditar] = useState<Omit<UpdateUserInput, 'id'>>({ ...EMPTY_FORM });
  const actualizarUsuario = useUpdateUser();

  function abrirEditar(u: User) {
    actualizarUsuario.reset();
    setUsuarioEditando(u);
    setFormEditar(userToEditForm(u));
  }

  async function handleEditar(e: FormEvent) {
    e.preventDefault();
    if (!usuarioEditando) return;
    actualizarUsuario.reset();
    const { password, ...rest } = formEditar;
    await actualizarUsuario.mutateAsync({ id: usuarioEditando._id, ...rest, ...(password ? { password } : {}) });
    setUsuarioEditando(null);
  }

  const actualizarEstado = useActualizarEstadoUsuario();

  async function handleToggleEstado(u: User) {
    actualizarEstado.reset();
    await actualizarEstado.mutateAsync({ id: u._id, estado: u.estado === 'activo' ? 'inactivo' : 'activo' });
  }

  const [usuarioEliminando, setUsuarioEliminando] = useState<User | null>(null);
  const eliminarUsuario = useEliminarUsuario();

  async function handleEliminar(e: FormEvent) {
    e.preventDefault();
    if (!usuarioEliminando) return;
    eliminarUsuario.reset();
    await eliminarUsuario.mutateAsync(usuarioEliminando._id);
    setUsuarioEliminando(null);
  }

  const [usuarioReseteando, setUsuarioReseteando] = useState<User | null>(null);
  const [passwordGenerada, setPasswordGenerada] = useState<string | null>(null);
  const resetearPassword = useResetearPassword();

  async function handleResetearPassword() {
    if (!usuarioReseteando) return;
    resetearPassword.reset();
    const res = await resetearPassword.mutateAsync(usuarioReseteando._id);
    setPasswordGenerada(res.password_temporal);
  }

  const [usuarioCerrando, setUsuarioCerrando] = useState<User | null>(null);
  const cerrarSesiones = useCerrarSesiones();

  async function handleCerrarSesiones(e: FormEvent) {
    e.preventDefault();
    if (!usuarioCerrando) return;
    cerrarSesiones.reset();
    await cerrarSesiones.mutateAsync(usuarioCerrando._id);
    setUsuarioCerrando(null);
  }

  const [importarOpen, setImportarOpen] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const bulkImport = useBulkImportUsers();

  async function handleImportar(e: FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    bulkImport.reset();
    await bulkImport.mutateAsync(archivo);
  }

  /** Jerarquía institucional (M02): solo se gestionan usuarios de rango inferior (o ADMIN a otros ADMIN). Nadie se edita a sí mismo. */
  function puedeGestionar(u: User): boolean {
    if (!currentUser) return false;
    if (u._id === currentUser.id) return false;
    return puedeGestionarRol(currentUser.rol, u.rol);
  }

  const paginaInfo = usersQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita y gestiona el acceso de administradores, coordinadores, docentes, estudiantes y acudientes."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportarOpen(true)}>
              <UploadIcon className="h-4 w-4" />
              Carga masiva
            </Button>
            <Button onClick={() => setDrawerOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Usuarios existentes"
          action={
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative">
                <Input
                  label="Buscar"
                  placeholder="Nombre, documento o correo"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-56 pl-9"
                />
                <SearchIcon className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted" />
              </div>
              <MultiSelect
                label="Rol"
                options={ROLES.map((r) => ({
                  value: r,
                  label: ROL_LABELS[r],
                  badge: <RolBadge value={r} />,
                }))}
                selected={filterRoles}
                onChange={setFilterRoles}
                allLabel="Todos los roles"
                className="w-52"
              />
              <Select label="Sede" value={filterSede} onChange={(e) => setFilterSede(e.target.value)} className="w-40">
                <option value="">Todas las sedes</option>
                {sedes.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {usersQuery.isLoading && <Spinner />}
        {usersQuery.isError && <Alert tone="error">{errorMessage(usersQuery.error)}</Alert>}
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        {paginaInfo && (
          <>
            <Table>
              <TableHead>
                <Th>Nombre</Th>
                <Th>Documento</Th>
                <Th>Correo</Th>
                <Th>Rol</Th>
                <Th>Sedes</Th>
                <Th>Último acceso</Th>
                <Th>Estado</Th>
                <Th />
              </TableHead>
              <TableBody>
                {paginaInfo.data.map((u) => (
                  <tr key={u._id}>
                    <Td className="font-medium text-ink">
                      {u.nombre} {u.apellido}
                    </Td>
                    <Td>
                      {u.tipo_documento} {u.numero_documento}
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <RolBadge value={u.rol} />
                    </Td>
                    <Td>
                      {sedeIdsDe(u).length === 0 ? (
                        <Chip tone="blue">Global</Chip>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.sedes_ids.map((s) =>
                            typeof s === 'string' ? null : (
                              <Chip key={s._id} tone="neutral">
                                {s.nombre}
                              </Chip>
                            )
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>{u.ultimo_login ? new Date(u.ultimo_login).toLocaleString() : 'Nunca'}</Td>
                    <Td>
                      <EstadoUsuarioBadge value={u.estado} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <IconButton
                          tone="edit"
                          label={puedeGestionar(u) ? 'Editar usuario' : 'Sin permisos jerárquicos para editar este rol'}
                          icon={<PencilIcon />}
                          disabled={!puedeGestionar(u)}
                          onClick={() => abrirEditar(u)}
                        />
                        <IconButton
                          tone="neutral"
                          label={puedeGestionar(u) ? 'Resetear contraseña' : 'Sin permisos jerárquicos para resetear clave de este rol'}
                          icon={<KeyIcon />}
                          disabled={!puedeGestionar(u)}
                          onClick={() => {
                            resetearPassword.reset();
                            setPasswordGenerada(null);
                            setUsuarioReseteando(u);
                          }}
                        />
                        <IconButton
                          tone="neutral"
                          label={puedeGestionar(u) ? 'Cerrar sesiones activas' : 'Sin permisos jerárquicos para cerrar sesiones de este rol'}
                          icon={<LogOutIcon />}
                          disabled={!puedeGestionar(u)}
                          onClick={() => setUsuarioCerrando(u)}
                        />
                        <IconButton
                          tone={u.estado === 'activo' ? 'neutral' : 'success'}
                          label={
                            !puedeGestionar(u)
                              ? 'Sin permisos jerárquicos para cambiar estado de este rol'
                              : u.estado === 'activo'
                              ? 'Desactivar usuario'
                              : 'Activar usuario'
                          }
                          icon={u.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                          disabled={!puedeGestionar(u) || actualizarEstado.isPending}
                          onClick={() => handleToggleEstado(u)}
                        />
                        <IconButton
                          tone="danger"
                          label={puedeGestionar(u) ? 'Eliminar usuario' : 'Sin permisos jerárquicos para eliminar este rol'}
                          icon={<TrashIcon />}
                          disabled={!puedeGestionar(u)}
                          onClick={() => setUsuarioEliminando(u)}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
                {paginaInfo.data.length === 0 && <EmptyRow colSpan={8}>Sin resultados.</EmptyRow>}
              </TableBody>
            </Table>

            {paginaInfo.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-muted">
                <span>
                  Página {paginaInfo.page} de {paginaInfo.pages} ({paginaInfo.total} usuarios)
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button variant="secondary" disabled={page >= paginaInfo.pages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        title="Nuevo usuario"
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        submitLabel="Crear usuario"
        isSubmitting={createUser.isPending}
      >
        {createUser.isError && <Alert tone="error">{errorMessage(createUser.error)}</Alert>}

        <Input label="Nombre" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        <Input label="Apellido" required value={form.apellido} onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))} />
        <Select
          label="Tipo de documento"
          value={form.tipo_documento}
          onChange={(e) => setForm((f) => ({ ...f, tipo_documento: e.target.value as TipoDocumento }))}
        >
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input
          label="Número de documento"
          required
          value={form.numero_documento}
          onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
        />
        <Input
          label="Correo electrónico"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Input label="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
        <Input
          label="Contraseña temporal"
          type="password"
          required
          minLength={8}
          hint="El usuario deberá cambiarla en su primer inicio de sesión."
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <Select label="Rol" value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as Rol }))}>
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <SedesCheckboxList
          sedes={sedes}
          seleccionadas={form.sedes_ids ?? []}
          onChange={(sedes_ids) => setForm((f) => ({ ...f, sedes_ids }))}
        />
      </Drawer>

      <Drawer
        open={usuarioEditando !== null}
        title="Editar usuario"
        subtitle={usuarioEditando ? `${usuarioEditando.nombre} ${usuarioEditando.apellido}` : undefined}
        onClose={() => setUsuarioEditando(null)}
        onSubmit={handleEditar}
        submitLabel="Guardar cambios"
        isSubmitting={actualizarUsuario.isPending}
      >
        {actualizarUsuario.isError && <Alert tone="error">{errorMessage(actualizarUsuario.error)}</Alert>}

        <Input
          label="Nombre"
          required
          value={formEditar.nombre}
          onChange={(e) => setFormEditar((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Input
          label="Apellido"
          required
          value={formEditar.apellido}
          onChange={(e) => setFormEditar((f) => ({ ...f, apellido: e.target.value }))}
        />
        <Select
          label="Tipo de documento"
          value={formEditar.tipo_documento}
          onChange={(e) => setFormEditar((f) => ({ ...f, tipo_documento: e.target.value as TipoDocumento }))}
        >
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input
          label="Número de documento"
          required
          value={formEditar.numero_documento}
          onChange={(e) => setFormEditar((f) => ({ ...f, numero_documento: e.target.value }))}
        />
        <Input
          label="Correo electrónico"
          type="email"
          required
          value={formEditar.email}
          onChange={(e) => setFormEditar((f) => ({ ...f, email: e.target.value }))}
        />
        <Input
          label="Teléfono"
          value={formEditar.telefono}
          onChange={(e) => setFormEditar((f) => ({ ...f, telefono: e.target.value }))}
        />
        <Select
          label="Rol"
          value={formEditar.rol}
          onChange={(e) => setFormEditar((f) => ({ ...f, rol: e.target.value as Rol }))}
        >
          {ROLES.filter((r) => currentUser && (puedeGestionarRol(currentUser.rol, r) || r === usuarioEditando?.rol)).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <SedesCheckboxList
          sedes={sedes}
          seleccionadas={formEditar.sedes_ids ?? []}
          onChange={(sedes_ids) => setFormEditar((f) => ({ ...f, sedes_ids }))}
        />
        <Input
          label="Nueva contraseña (opcional)"
          type="password"
          minLength={8}
          hint="Las contraseñas no se pueden ver: déjalo vacío para no cambiarla, o escribe una nueva para resetearla."
          value={formEditar.password}
          onChange={(e) => setFormEditar((f) => ({ ...f, password: e.target.value }))}
        />
      </Drawer>

      <Drawer
        open={usuarioEliminando !== null}
        title="Eliminar usuario"
        onClose={() => setUsuarioEliminando(null)}
        onSubmit={handleEliminar}
        submitLabel="Sí, eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminarUsuario.isPending}
      >
        {eliminarUsuario.isError && <Alert tone="error">{errorMessage(eliminarUsuario.error)}</Alert>}
        <Alert tone="warning">
          Esta acción no se puede deshacer. Si el usuario ya tiene historial registrado (matrículas, asistencia,
          notas), el sistema no permitirá borrarlo: usa "Desactivar" en su lugar.
        </Alert>
        <p className="text-sm text-body">
          ¿Eliminar a <strong>{usuarioEliminando?.nombre} {usuarioEliminando?.apellido}</strong>?
        </p>
      </Drawer>

      <Drawer
        open={usuarioReseteando !== null}
        title="Resetear contraseña"
        subtitle={usuarioReseteando ? `${usuarioReseteando.nombre} ${usuarioReseteando.apellido}` : undefined}
        onClose={() => {
          setUsuarioReseteando(null);
          setPasswordGenerada(null);
        }}
        onSubmit={passwordGenerada ? undefined : (e) => { e.preventDefault(); void handleResetearPassword(); }}
        submitLabel="Generar contraseña temporal"
        isSubmitting={resetearPassword.isPending}
      >
        {resetearPassword.isError && <Alert tone="error">{errorMessage(resetearPassword.error)}</Alert>}
        {passwordGenerada ? (
          <>
            <Alert tone="success">
              Contraseña temporal generada. Cópiala ahora: no se podrá volver a mostrar. El usuario deberá cambiarla
              en su próximo inicio de sesión.
            </Alert>
            <div className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 font-mono text-sm text-ink">
              {passwordGenerada}
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => navigator.clipboard.writeText(passwordGenerada)}
              >
                Copiar
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-body">
            Se generará una nueva contraseña temporal y se cerrarán las sesiones activas del usuario.
          </p>
        )}
      </Drawer>

      <Drawer
        open={usuarioCerrando !== null}
        title="Cerrar sesiones activas"
        onClose={() => setUsuarioCerrando(null)}
        onSubmit={handleCerrarSesiones}
        submitLabel="Sí, cerrar sesiones"
        isSubmitting={cerrarSesiones.isPending}
      >
        {cerrarSesiones.isError && <Alert tone="error">{errorMessage(cerrarSesiones.error)}</Alert>}
        <p className="text-sm text-body">
          El usuario <strong>{usuarioCerrando?.nombre} {usuarioCerrando?.apellido}</strong> deberá iniciar sesión de
          nuevo en todos sus dispositivos.
        </p>
      </Drawer>

      <Drawer
        open={importarOpen}
        title="Carga masiva de usuarios"
        subtitle="Un archivo CSV con un usuario por fila."
        size="lg"
        onClose={() => {
          setImportarOpen(false);
          setArchivo(null);
          bulkImport.reset();
        }}
        onSubmit={handleImportar}
        submitLabel="Importar"
        isSubmitting={bulkImport.isPending}
        submitDisabled={!archivo}
      >
        {bulkImport.isError && <Alert tone="error">{errorMessage(bulkImport.error)}</Alert>}
        <GuiaColumnas notas={NOTAS_CSV_USUARIOS} columnas={COLUMNAS_USUARIOS} />
        <Input
          label="Archivo CSV"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        {bulkImport.data && (
          <div className="space-y-2">
            <Alert tone={bulkImport.data.fallidos > 0 ? 'warning' : 'success'}>
              {bulkImport.data.creados} de {bulkImport.data.total_filas} usuarios creados.
              {bulkImport.data.fallidos > 0 && ` ${bulkImport.data.fallidos} filas con error.`}
            </Alert>
            {bulkImport.data.errores.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-danger-soft p-3 text-xs text-danger">
                {bulkImport.data.errores.map((err) => (
                  <li key={err.fila}>
                    Fila {err.fila} ({err.numero_documento ?? 's/d'}): {err.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
