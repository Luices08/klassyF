import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  Calendario,
  EstadoActivo,
  FranjaPlantilla,
  Institution,
  ModalidadInstitucion,
  Periodo,
  PoliticaAforoAula,
  SetupInstitutionResult,
} from '../types/domain';

export interface SetupInstitutionInput {
  institucion: {
    nombre: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
    modalidad?: ModalidadInstitucion;
    administrador_id?: string;
  };
  sede_principal: {
    nombre: string;
    codigo_dane_sede: string;
    direccion: string;
  };
  anio_lectivo: {
    year: number;
    calendario: Calendario;
    periodos: Periodo[];
  };
}

/** Solo existe una institucion por despliegue: no recibe id. */
export function useInstitution() {
  return useQuery({
    queryKey: ['institution'],
    queryFn: () => api.get<Institution | null>('/institution'),
  });
}

export function useSetupInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInstitutionInput) =>
      api.post<SetupInstitutionResult>('/institution/setup', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
    },
  });
}

export interface UpdateInstitutionInput {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  estado?: EstadoActivo;
  logo_url?: string | null;
  correo_secretaria?: string | null;
  horario_atencion?: string | null;
  modalidad?: ModalidadInstitucion;
  politica_aforo_aula?: PoliticaAforoAula;
  confirm_password: string;
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInstitutionInput) => api.patch<Institution>('/institution', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
    },
  });
}

/** Plantilla base de franjas horarias de la institución; se carga en las jornadas y M09 usa el resultado. */
export function useActualizarPlantillaFranjas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (franjas: FranjaPlantilla[]) => api.put<Institution>('/institution/plantilla-franjas', { franjas }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
    },
  });
}
