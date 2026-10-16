import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getStoredToken, setStoredToken, UNAUTHORIZED_EVENT } from '../lib/apiClient';
import type { AuthUser, LoginResponse, Rol } from '../types/api';

const USER_STORAGE_KEY = 'klassy.user';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const guardado = JSON.parse(raw) as AuthUser;
    // Sesiones guardadas antes de los perfiles múltiples no traen `roles`.
    return { ...guardado, roles: guardado.roles?.length ? guardado.roles : [guardado.rol] };
  } catch {
    return null;
  }
}

function writeStoredUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // ignorar: sin persistencia en este navegador
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Abre la sesión con el perfil elegido en el formulario; si la persona no lo tiene habilitado el servidor responde 403. */
  login: (numeroDocumento: string, password: string, rol: Rol) => Promise<AuthUser>;
  /** Pasa a otro de los perfiles de la persona sin volver a pedir la contraseña. */
  cambiarPerfil: (rol: Rol) => Promise<AuthUser>;
  logout: () => void;
  /** Aplica un cambio local al usuario en sesion (ej. debe_cambiar_password) sin volver a llamar al login. */
  actualizarUsuarioEnSesion: (patch: Partial<AuthUser>) => void;
  /** Reemplaza el token tras reemitirlo (ej. cambio de la propia contraseña). */
  actualizarToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => (getStoredToken() ? readStoredUser() : null));
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    queryClient.clear();
    setStoredToken(null);
    writeStoredUser(null);
    setUser(null);
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  // Cada perfil ve datos distintos: lo que haya quedado en caché del perfil o la persona anterior no se reutiliza.
  const abrirSesion = useCallback(
    (res: LoginResponse) => {
      queryClient.clear();
      setStoredToken(res.token);
      writeStoredUser(res.user);
      setUser(res.user);
      return res.user;
    },
    [queryClient]
  );

  const login = useCallback(
    async (numeroDocumento: string, password: string, rol: Rol): Promise<AuthUser> => {
      setIsLoading(true);
      try {
        return abrirSesion(await api.raw<LoginResponse>('/auth/login', { method: 'POST', body: { numero_documento: numeroDocumento, password, rol } }));
      } finally {
        setIsLoading(false);
      }
    },
    [abrirSesion]
  );

  const cambiarPerfil = useCallback(
    async (rol: Rol) => abrirSesion(await api.raw<LoginResponse>('/auth/cambiar-perfil', { method: 'POST', body: { rol } })),
    [abrirSesion]
  );

  const actualizarUsuarioEnSesion = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStoredUser(next);
      return next;
    });
  }, []);

  const actualizarToken = useCallback((token: string) => {
    setStoredToken(token);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, login, cambiarPerfil, logout, actualizarUsuarioEnSesion, actualizarToken }),
    [user, isLoading, login, cambiarPerfil, logout, actualizarUsuarioEnSesion, actualizarToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
