import { type FormEvent, type ReactNode, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useCambiarMiPassword } from '../../hooks/useUsers';

/**
 * Bloquea toda la app (M02: "forzar cambio de contraseña en el primer inicio de
 * sesión") hasta que el usuario defina una contraseña propia. Se muestra sobre
 * cualquier ruta mientras `debe_cambiar_password` sea true.
 */
export function ForcedPasswordChangeGate({ children }: { children: ReactNode }) {
  const { user, actualizarUsuarioEnSesion, actualizarToken } = useAuth();
  const cambiarPassword = useCambiarMiPassword();
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', confirmar: '' });
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  if (!user?.debe_cambiar_password) return <>{children}</>;

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
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-soft p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-h3 text-ink">Debes cambiar tu contraseña</h1>
        <p className="mt-1 text-sm text-muted">
          Por seguridad, tu cuenta tiene una contraseña temporal. Define una nueva antes de continuar.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {cambiarPassword.isError && <Alert tone="error">{errorMessage(cambiarPassword.error)}</Alert>}
          {errorLocal && <Alert tone="error">{errorLocal}</Alert>}

          <Input
            label="Contraseña temporal actual"
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
          <Button type="submit" className="w-full" isLoading={cambiarPassword.isPending}>
            Cambiar contraseña y continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
