import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { RolBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { UserIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { useCambiarMiPassword, useMe, useUpdateMe } from '../hooks/useUsers';

const FOTO_MAX_BYTES = 300 * 1024;

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-label uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

export function MyAccountPage() {
  const meQuery = useMe();

  if (meQuery.isLoading) return <Spinner />;
  if (meQuery.isError) return <Alert tone="error">{errorMessage(meQuery.error)}</Alert>;
  if (!meQuery.data) return null;

  const me = meQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Mi cuenta" subtitle="Consulta tus datos, actualiza tu contacto y cambia tu contraseña." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PerfilCard me={me} />
        <PasswordCard />
      </div>
    </div>
  );
}

function PerfilCard({ me }: { me: NonNullable<ReturnType<typeof useMe>['data']> }) {
  const updateMe = useUpdateMe();
  const [telefono, setTelefono] = useState(me.telefono ?? '');
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(me.foto_url);

  function handleFotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoError(null);

    if (file.size > FOTO_MAX_BYTES) {
      setFotoError('La foto no puede pesar más de 300KB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setFotoPreview(reader.result);
      updateMe.mutate({ foto_url: reader.result });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateMe.reset();
    await updateMe.mutateAsync({ telefono });
  }

  return (
    <Card>
      <CardHeader title="Mis datos" />
      {updateMe.isError && <Alert tone="error">{errorMessage(updateMe.error)}</Alert>}
      {updateMe.isSuccess && <Alert tone="success">Datos actualizados.</Alert>}

      <div className="mb-4 flex items-center gap-4">
        {fotoPreview ? (
          <img src={fotoPreview} alt="Foto de perfil" className="h-16 w-16 rounded-full border border-border object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border text-muted">
            <UserIcon className="h-6 w-6" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-ink">
            {me.nombre} {me.apellido}
          </p>
          <div className="mt-1">
            <RolBadge value={me.rol} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StaticField label="Documento" value={`${me.tipo_documento} ${me.numero_documento}`} />
        <StaticField label="Correo" value={me.email} />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Input
          label="Foto de perfil (opcional, máx. 300KB)"
          type="file"
          accept="image/*"
          onChange={handleFotoChange}
          error={fotoError ?? undefined}
        />
        <Button type="submit" isLoading={updateMe.isPending}>
          Guardar cambios
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const cambiarPassword = useCambiarMiPassword();
  const { actualizarUsuarioEnSesion, actualizarToken } = useAuth();
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', confirmar: '' });
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    cambiarPassword.reset();

    if (form.password_nueva !== form.confirmar) {
      setErrorLocal('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    const res = await cambiarPassword.mutateAsync({
      password_actual: form.password_actual,
      password_nueva: form.password_nueva,
    });
    actualizarToken(res.token);
    actualizarUsuarioEnSesion({ debe_cambiar_password: false });
    setForm({ password_actual: '', password_nueva: '', confirmar: '' });
  }

  return (
    <Card>
      <CardHeader title="Cambiar contraseña" />
      {cambiarPassword.isError && <Alert tone="error">{errorMessage(cambiarPassword.error)}</Alert>}
      {errorLocal && <Alert tone="error">{errorLocal}</Alert>}
      {cambiarPassword.isSuccess && <Alert tone="success">Contraseña actualizada correctamente.</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Contraseña actual"
          type="password"
          required
          value={form.password_actual}
          onChange={(e) => setForm((f) => ({ ...f, password_actual: e.target.value }))}
        />
        <Input
          label="Nueva contraseña"
          type="password"
          required
          minLength={8}
          value={form.password_nueva}
          onChange={(e) => setForm((f) => ({ ...f, password_nueva: e.target.value }))}
        />
        <Input
          label="Confirmar nueva contraseña"
          type="password"
          required
          minLength={8}
          value={form.confirmar}
          onChange={(e) => setForm((f) => ({ ...f, confirmar: e.target.value }))}
        />
        <Button type="submit" isLoading={cambiarPassword.isPending}>
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}
