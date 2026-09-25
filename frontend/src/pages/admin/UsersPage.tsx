import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoUsuarioBadge, RolBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PlusIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useCreateUser, useUsers, type CreateUserInput } from '../../hooks/useUsers';
import { ROLES, type Rol } from '../../types/api';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '../../types/domain';

const RESTRICTED_ROLES: Rol[] = ['SUPERADMIN', 'ADMIN'];

const EMPTY_FORM: CreateUserInput = {
  nombre: '',
  apellido: '',
  tipo_documento: 'CC',
  numero_documento: '',
  email: '',
  password: '',
  rol: 'ESTUDIANTE',
};

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [filterRol, setFilterRol] = useState<Rol | ''>('');
  const usersQuery = useUsers(filterRol ? { rol: filterRol } : {});
  const createUser = useCreateUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);

  const assignableRoles = ROLES.filter(
    (r) => currentUser?.rol === 'SUPERADMIN' || !RESTRICTED_ROLES.includes(r)
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.reset();
    await createUser.mutateAsync(form);
    setForm(EMPTY_FORM);
    setDrawerOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Crea administradores, coordinadores, docentes, estudiantes y acudientes."
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
        {usersQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Documento</Th>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
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
                </tr>
              ))}
              {usersQuery.data.length === 0 && <EmptyRow colSpan={5}>Sin resultados.</EmptyRow>}
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
    </div>
  );
}
