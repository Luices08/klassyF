import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'klassy.institutionConfig';

export interface InstitutionConfig {
  institutionId: string;
  institutionName: string;
  sedeId: string;
  sedeName: string;
  academicYearId: string;
  academicYearYear: number;
}

function readStored(): InstitutionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InstitutionConfig) : null;
  } catch {
    return null;
  }
}

interface InstitutionConfigContextValue {
  config: InstitutionConfig | null;
  setConfig: (config: InstitutionConfig) => void;
}

const InstitutionConfigContext = createContext<InstitutionConfigContextValue | undefined>(undefined);

/**
 * Recuerda el ultimo colegio/sede/año lectivo creados desde el asistente de
 * configuración inicial, para prellenar formularios posteriores (Grupos,
 * Matrículas, Boletín) sin obligar a pegar ObjectIds a mano. Es una
 * conveniencia de UI, no una fuente de verdad — el backend sigue validando
 * cada id igual.
 */
export function InstitutionConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<InstitutionConfig | null>(() => readStored());

  const setConfig = useCallback((next: InstitutionConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sin persistencia en este navegador; el estado en memoria sigue funcionando
    }
    setConfigState(next);
  }, []);

  const value = useMemo(() => ({ config, setConfig }), [config, setConfig]);

  return <InstitutionConfigContext.Provider value={value}>{children}</InstitutionConfigContext.Provider>;
}

export function useInstitutionConfig(): InstitutionConfigContextValue {
  const ctx = useContext(InstitutionConfigContext);
  if (!ctx) throw new Error('useInstitutionConfig debe usarse dentro de <InstitutionConfigProvider>.');
  return ctx;
}
