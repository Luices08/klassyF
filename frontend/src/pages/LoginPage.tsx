import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SelectorRolLogin } from '../components/auth/SelectorRolLogin';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { ArrowLeftIcon, BuildingIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { usePublicInstitutionInfo } from '../hooks/usePublicInfo';
import { urlDeApi } from '../lib/apiClient';
import { rutaInicialDe } from '../lib/rutaInicial';
import { ROLES, type Rol } from '../types/api';

const PERFIL_GUARDADO_KEY = 'klassy.ultimoPerfil';

/** Comodidad del navegador: recuerda el último perfil con el que se entró. Si no hay almacenamiento, simplemente no se recuerda. */
function leerPerfilGuardado(): Rol | null {
  try {
    const guardado = localStorage.getItem(PERFIL_GUARDADO_KEY);
    return (ROLES as readonly string[]).includes(guardado ?? '') ? (guardado as Rol) : null;
  } catch {
    return null;
  }
}

function guardarPerfil(rol: Rol): void {
  try {
    localStorage.setItem(PERFIL_GUARDADO_KEY, rol);
  } catch {
    // sin persistencia en este navegador
  }
}

export function LoginPage() {
  const { login, user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const info = usePublicInstitutionInfo();
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol | null>(leerPerfilGuardado);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated && user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? rutaInicialDe(user.rol)} replace />;
  }

  const institucion = info.data;
  const nombreColegio = institucion?.nombre ?? 'Klassy';
  const imagen = institucion?.imagen_login_version ? urlDeApi(`/public/institution-imagen/login?v=${institucion.imagen_login_version}`) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rol) {
      setError('Elige el perfil con el que quieres entrar.');
      return;
    }
    setError(null);
    try {
      const usuario = await login(numeroDocumento, password, rol);
      guardarPerfil(rol);
      navigate(rutaInicialDe(usuario.rol), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="grid min-h-screen bg-soft lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: la foto del colegio (si la cargó) o el azul de acción. */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        {imagen && <img src={imagen} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className={`absolute inset-0 ${imagen ? 'bg-gradient-to-t from-ink/85 via-ink/40 to-ink/20' : 'bg-gradient-to-br from-primary to-ink/70'}`} />

        <div className="relative flex items-center gap-3 text-surface">
          {institucion?.logo_url ? (
            <img src={institucion.logo_url} alt="" className="h-12 w-12 rounded-xl bg-surface object-contain p-1.5 shadow-md" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface/20 backdrop-blur">
              <BuildingIcon className="h-6 w-6" />
            </span>
          )}
          <span className="text-h3 font-semibold">Klassy</span>
        </div>

        <div className="relative max-w-md text-surface">
          <h1 className="text-h1">{institucion ? nombreColegio : 'Bienvenido a Klassy'}</h1>
          <p className="mt-3 text-body text-surface/85">Gestor académico y administrativo. Un solo lugar para estudiantes, docentes, familias y directivos.</p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-body shadow-xs transition-colors hover:bg-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Volver al inicio</span>
          </Link>
        </div>

        <div className="w-full max-w-md pt-10 lg:pt-0">
          {/* En pantallas pequeñas el panel de marca no cabe: se resume en un encabezado. */}
          <div className="mb-6 text-center lg:hidden">
            {institucion?.logo_url && <img src={institucion.logo_url} alt="" className="mx-auto mb-3 h-14 w-14 rounded-xl border border-border bg-surface object-contain p-1.5" />}
            <h1 className="text-h2 text-primary">{nombreColegio}</h1>
            <p className="mt-1 text-sm text-muted">Gestor académico y administrativo</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-md sm:p-8">
            <div>
              <h2 className="text-h3 text-ink">Iniciar sesión</h2>
              <p className="mt-1 text-sm text-muted">Elige tu perfil e ingresa con tu documento y contraseña.</p>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <SelectorRolLogin value={rol} onChange={setRol} disabled={isLoading} />

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

            <p className="text-center text-xs text-muted">Si tienes más de un perfil (por ejemplo docente y acudiente) puedes cambiar de uno a otro después, sin volver a escribir tu contraseña.</p>
          </form>
        </div>
      </main>
    </div>
  );
}
