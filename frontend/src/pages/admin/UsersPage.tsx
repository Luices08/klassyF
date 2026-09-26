import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoUsuarioBadge, RolBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  useActualizarEstadoUsuario,
  useCreateUser,
  useEliminarUsuario,
  useUpdateUser,
  useUsers,
  type CreateUserInput,
  type UpdateUserInput,
} from '../../hooks/useUsers';
import { ROLES, type Rol } from '../../types/api';
import { TIPOS_DOCUMENTO, type TipoDocumento, type User } from '../../types/domain';

// Un solo rol de maximo privilegio (ADMIN) desde que se quito SUPERADMIN.
const RESTRICTED_ROLES: Rol[] = ['ADMIN'];

const EMPTY_FORM: CreateUserInput = {
  nombre: '',
  apellido: '',
  tipo_documento: 'CC',
  numero_documento: '',
  email: '',
  password: '',
  rol: 'ESTUDIANTE',
};

function userToEditForm(u: User): Omit<UpdateUserInput, 'id'> {
  return {
    nombre: u.nombre,
    apellido: u.apellido,
    tipo_documento: u.tipo_documento,
    numero_documento: u.numero_documento,
    email: u.email,
    rol: u.rol,
    password: '',
  };
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [filterRol, setFilterRol] = useState<Rol | ''>('');
  const usersQuery = useUsers(filterRol ? { rol: filterRol } : {});
  const createUser = useCreateUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);

  const esAdmin = currentUser?.rol === 'ADMIN';
  const assignableRoles = ROLES.filter((r) => esAdmin || !RESTRICTED_ROLES.includes(r));

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

  /** Un COORDINADOR/SECRETARIA no puede tocar una cuenta ADMIN, y nadie se edita el estado a si mismo. */
  function puedeGestionar(u: User): boolean {
    if (u._id === currentUser?.id) return false;
    if (u.rol === 'ADMIN' && !esAdmin) return false;
    return true;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        subtitle="Crea, edita y gestiona el acceso de administradores, coordinadores, docentes, estudiantes y acudientes."
        action={
          <Button onClick={() => setDrawerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Usuarios existentes"
          action={
            <Select
              label="Filtrar por rol"
              value={filterRol}
              onChange={(e) => setFilterRol(e.target.value as Rol | '')}
              className="w-40"
            >
              <option value="">Todos los roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          }
        />
        {usersQuery.isLoading && <Spinner />}
        {usersQuery.isError && <Alert tone="error">{errorMessage(usersQuery.error)}</Alert>}
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        {usersQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Documento</Th>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {usersQuery.data.map((u) => (
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
                    <EstadoUsuarioBadge value={u.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton
                        tone="edit"
                        label="Editar usuario"
                        icon={<PencilIcon />}
                        disabled={!puedeGestionar(u)}
                        onClick={() => abrirEditar(u)}
                      />
                      <IconButton
                        tone={u.estado === 'activo' ? 'danger' : 'success'}
                        label={u.estado === 'activo' ? 'Desactivar usuario' : 'Activar usuario'}
                        icon={u.estado === 'activo' ? <TrashIcon /> : <RefreshIcon />}
                        disabled={!puedeGestionar(u) || actualizarEstado.isPending}
                        onClick={() => handleToggleEstado(u)}
                      />
                      <IconButton
                        tone="danger"
                        label="Eliminar usuario"
                        icon={<TrashIcon />}
                        disabled={!puedeGestionar(u)}
                        onClick={() => setUsuarioEliminando(u)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {usersQuery.data.length === 0 && <EmptyRow colSpan={6}>Sin resultados.</EmptyRow>}
            </TableBody>
          </Table>
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
        <Input
          label="Contraseña"
          type="password"
          required
          minLength={8}
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
        <Select
          label="Rol"
          value={formEditar.rol}
          onChange={(e) => setFormEditar((f) => ({ ...f, rol: e.target.value as Rol }))}
        >
          {ROLES.filter((r) => esAdmin || !RESTRICTED_ROLES.includes(r) || r === usuarioEditando?.rol).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
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
        <Alert tone="warning">Esta acción no se puede deshacer.</Alert>
        <p className="text-sm text-body">
          ¿Eliminar a <strong>{usuarioEliminando?.nombre} {usuarioEliminando?.apellido}</strong>?
        </p>
      </Drawer>
    </div>
  );
}
