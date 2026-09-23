import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useCreateUser, useUsers, type CreateUserInput } from '../../hooks/useUsers';
import { ROLES, type Rol } from '../../types/api';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '../../types/domain';

const RESTRICTED_ROLES: Rol[] = ['SUPERADMIN', 'RECTOR'];

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
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);

  const assignableRoles = ROLES.filter(
    (r) => currentUser?.rol === 'SUPERADMIN' || !RESTRICTED_ROLES.includes(r)
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.reset();
    await createUser.mutateAsync(form);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-500">Crea rectores, coordinadores, docentes, estudiantes y acudientes.</p>
      </div>

      <Card>
        <CardHeader title="Nuevo usuario" />
        {createUser.isError && <Alert tone="error">{errorMessage(createUser.error)}</Alert>}
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

          <div className="sm:col-span-3">
            <Button type="submit" isLoading={createUser.isPending}>
              Crear usuario
            </Button>
          </div>
        </form>
      </Card>

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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Correo</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersQuery.data.map((u) => (
                  <tr key={u._id}>
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {u.nombre} {u.apellido}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {u.tipo_documento} {u.numero_documento}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Badge>{u.rol}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={u.estado === 'activo' ? 'green' : 'red'}>{u.estado}</Badge>
                    </td>
                  </tr>
                ))}
                {usersQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
