import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { rutaInicialDe } from '../../lib/rutaInicial';
import type { Rol } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { ROL_LABELS, RolBadge } from '../ui/Badge';
import { ChevronDownIcon, LogOutIcon, RefreshIcon, UserIcon } from '../ui/icons';

const ELEMENTO = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';

/**
 * El menú de quien tiene la sesión abierta: su nombre y su perfil en el encabezado y, al abrirlo, «Mi perfil», entrar con otro perfil (si la persona tiene más de uno, p. ej.
 * docente y acudiente: cambia la sesión completa, no solo el menú, y no pide la contraseña) y «Cerrar sesión».
 * Se cierra al tocar fuera, con Escape o al elegir una opción.
 */
export function MenuDeUsuario() {
  const { user, logout, cambiarPerfil } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [cambiandoA, setCambiandoA] = useState<Rol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alHacerClic = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        disparador.current?.focus();
      }
    };
    document.addEventListener('mousedown', alHacerClic);
    document.addEventListener('keydown', alPulsar);
    return () => {
      document.removeEventListener('mousedown', alHacerClic);
      document.removeEventListener('keydown', alPulsar);
    };
  }, [abierto]);

  if (!user) return null;
  const otros = (user.roles ?? []).filter((rol) => rol !== user.rol);
  const iniciales = `${user.nombre.charAt(0)}${user.apellido.charAt(0)}`.toUpperCase();

  async function cambiar(rol: Rol) {
    setError(null);
    setCambiandoA(rol);
    try {
      const nuevo = await cambiarPerfil(rol);
      setAbierto(false);
      navigate(rutaInicialDe(nuevo.rol), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCambiandoA(null);
    }
  }

  return (
    <div ref={raiz} className="relative">
      <button
        ref={disparador}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-3 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {iniciales}
        </span>
        <span className="hidden text-left md:block">
          <span className="block text-sm font-semibold leading-tight text-ink">
            {user.nombre} {user.apellido}
          </span>
          <span className="mt-0.5 block">
            <RolBadge value={user.rol} />
          </span>
        </span>
        <span className="sr-only md:hidden">
          {user.nombre} {user.apellido}, {ROL_LABELS[user.rol]}
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" aria-label="Menú de usuario" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          <div className="px-3 pb-2 pt-1.5 md:hidden">
            <p className="text-sm font-semibold text-ink">
              {user.nombre} {user.apellido}
            </p>
            <div className="mt-1">
              <RolBadge value={user.rol} />
            </div>
          </div>

          <NavLink to="/mi-cuenta" role="menuitem" onClick={() => setAbierto(false)} className={`${ELEMENTO} text-body hover:bg-soft`}>
            <UserIcon className="h-[18px] w-[18px] shrink-0" />
            Mi perfil
          </NavLink>

          {otros.map((rol) => (
            <button key={rol} type="button" role="menuitem" disabled={cambiandoA !== null} onClick={() => void cambiar(rol)} className={`${ELEMENTO} text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60`}>
              <RefreshIcon className="h-[18px] w-[18px] shrink-0" />
              {cambiandoA === rol ? 'Cambiando…' : `Entrar como ${ROL_LABELS[rol].toLowerCase()}`}
            </button>
          ))}
          {error && (
            <div className="px-1 py-1">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          <div className="my-1.5 border-t border-border" />
          <button type="button" role="menuitem" onClick={logout} className={`${ELEMENTO} text-danger hover:bg-danger-soft`}>
            <LogOutIcon className="h-[18px] w-[18px] shrink-0" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
