import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rutaInicialDe } from '../../lib/rutaInicial';
import type { Rol } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { ROL_LABELS } from '../ui/Badge';
import { RefreshIcon } from '../ui/icons';

/**
 * Botón del encabezado para quien tiene más de un perfil (p. ej. docente y acudiente): entra con el otro sin volver a escribir la
 * contraseña. Cambia la sesión completa, no solo el menú: cada perfil ve datos y permisos distintos.
 */
export function CambiadorDePerfil() {
  const { user, cambiarPerfil } = useAuth();
  const navigate = useNavigate();
  const [cambiandoA, setCambiandoA] = useState<Rol | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otros = (user?.roles ?? []).filter((rol) => rol !== user?.rol);
  if (!user || otros.length === 0) return null;

  async function cambiar(rol: Rol) {
    setError(null);
    setCambiandoA(rol);
    try {
      const nuevo = await cambiarPerfil(rol);
      navigate(rutaInicialDe(nuevo.rol), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCambiandoA(null);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      {otros.map((rol) => (
        <button
          key={rol}
          type="button"
          disabled={cambiandoA !== null}
          onClick={() => void cambiar(rol)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary ring-1 ring-inset ring-border hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon className="h-4 w-4" />
          {cambiandoA === rol ? 'Cambiando…' : `Entrar como ${ROL_LABELS[rol].toLowerCase()}`}
        </button>
      ))}
      {error && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
