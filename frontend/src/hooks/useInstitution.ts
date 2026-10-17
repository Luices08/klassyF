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
  ciudad?: string | null;
  departamento?: string | null;
  correo_secretaria?: string | null;
  horario_atencion?: string | null;
  confirm_password: string;
}

export interface AjustesInstitucionInput {
  modalidad?: ModalidadInstitucion;
  politica_aforo_aula?: PoliticaAforoAula;
  paz_y_salvo_docentes?: boolean;
  titulo_bachiller_defecto?: string;
}

/** Ajustes de funcionamiento (modalidad, aforo, paz y salvo, título de bachiller): bloques propios, sin contraseña. */
export function useActualizarAjustesInstitucion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ajustes: AjustesInstitucionInput) => api.patch<Institution>('/institution/ajustes', ajustes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
    },
  });
}

export type ClaveImagenInstitucional = 'login' | 'dashboard';
export type ImagenesInstitucion = Record<ClaveImagenInstitucional, { actualizada_en: string } | null>;

export function useImagenesInstitucion() {
  return useQuery({
    queryKey: ['institution', 'imagenes'],
    queryFn: () => api.get<ImagenesInstitucion>('/institution/imagenes'),
  });
}

export function useSubirImagenInstitucion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clave, file }: { clave: ClaveImagenInstitucional; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<ImagenesInstitucion>(`/institution/imagenes/${clave}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'institution-info'] });
    },
  });
}

export function useQuitarImagenInstitucion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clave: ClaveImagenInstitucional) => api.delete<ImagenesInstitucion>(`/institution/imagenes/${clave}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institution'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'institution-info'] });
    },
  });
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
