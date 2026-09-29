import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getStoredToken, setStoredToken, UNAUTHORIZED_EVENT } from '../lib/apiClient';
import type { AuthUser, LoginResponse } from '../types/api';

const USER_STORAGE_KEY = 'klassy.user';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
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
  login: (numeroDocumento: string, password: string) => Promise<AuthUser>;
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

  const logout = useCallback(() => {
    setStoredToken(null);
    writeStoredUser(null);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(async (numeroDocumento: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.raw<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { numero_documento: numeroDocumento, password },
      });
      setStoredToken(res.token);
      writeStoredUser(res.user);
      setUser(res.user);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    () => ({ user, isAuthenticated: user !== null, isLoading, login, logout, actualizarUsuarioEnSesion, actualizarToken }),
    [user, isLoading, login, logout, actualizarUsuarioEnSesion, actualizarToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
