import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { ArrowLeftIcon } from '../components/ui/icons';
import { SelectorPerfil } from '../components/auth/SelectorPerfil';
import { useAuth } from '../context/AuthContext';
import { rutaInicialDe } from '../lib/rutaInicial';
import type { Rol, SeleccionPerfilPendiente } from '../types/api';

export function LoginPage() {
  const { login, seleccionarPerfil, user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Contraseña correcta con varios perfiles: se muestra el selector y todavía no hay sesión.
  const [seleccion, setSeleccion] = useState<SeleccionPerfilPendiente | null>(null);
  const [abriendo, setAbriendo] = useState<Rol | null>(null);

  if (isAuthenticated && user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? rutaInicialDe(user.rol)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const resultado = await login(numeroDocumento, password);
      if (resultado.tipo === 'seleccion') {
        setPassword('');
        setSeleccion(resultado.seleccion);
        return;
      }
      navigate(rutaInicialDe(resultado.user.rol), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function elegirPerfil(rol: Rol) {
    if (!seleccion) return;
    setError(null);
    setAbriendo(rol);
    try {
      const usuario = await seleccionarPerfil(seleccion, rol);
      navigate(rutaInicialDe(usuario.rol), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setAbriendo(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-soft px-4">
      {/* Botón superior para volver al inicio */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-body shadow-xs transition-colors hover:bg-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span>Volver al inicio</span>
        </Link>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-h2 text-primary">Klassy</h1>
          <p className="mt-1 text-sm text-muted">Gestor académico y administrativo</p>
        </div>

        {seleccion ? (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <SelectorPerfil
              nombre={seleccion.usuario.nombre}
              perfiles={seleccion.perfiles}
              abriendo={abriendo}
              onElegir={(rol) => void elegirPerfil(rol)}
              onVolver={() => {
                setSeleccion(null);
                setError(null);
              }}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-xs">
          {error && <Alert tone="error">{error}</Alert>}

          <Input
            label="Número de documento"
            type="text"
            name="numero_documento"
            autoComplete="username"
            required
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
          />
          <Input
            label="Contraseña"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" isLoading={isLoading} className="w-full">
            Ingresar
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/')}
            className="w-full"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a la pantalla de inicio
          </Button>
        </form>
        )}
      </div>
    </div>
  );
}
