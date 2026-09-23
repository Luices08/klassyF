import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Periodo, SetupInstitutionResult } from '../types/domain';

export interface SetupInstitutionInput {
  institucion: {
    nombre: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
    rector_id?: string;
  };
  sede_principal: {
    nombre: string;
    codigo_dane_sede: string;
    direccion: string;
  };
  anio_lectivo: {
    year: number;
    calendario: 'A' | 'B';
    periodos: Periodo[];
  };
}

export function useSetupInstitution() {
  return useMutation({
    mutationFn: (input: SetupInstitutionInput) =>
      api.post<SetupInstitutionResult>('/institution/setup', input),
  });
}
