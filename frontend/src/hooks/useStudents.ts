import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  AutorizacionDatosSensibles,
  EstadoEstudiante,
  Genero,
  GrupoEtnico,
  GrupoSanguineo,
  Guardian,
  Parentesco,
  RegimenSalud,
  StudentDirectoryItem,
  StudentFicha360,
  StudentProfile,
  TipoDocumento,
  User,
} from '../types/domain';

export interface StudentsFilter {
  search?: string;
  estado?: EstadoEstudiante;
  eps?: string;
  discapacidad?: boolean;
  page?: number;
  limit?: number;
}

export interface StudentsPageResult {
  data: StudentDirectoryItem[];
  total: number;
  page: number;
  pages: number;
}

export function useStudentsDirectory(filter: StudentsFilter, enabled = true) {
  return useQuery({
    queryKey: ['students', filter],
    enabled,
    queryFn: () =>
      api.raw<{ success: true; data: StudentDirectoryItem[]; total: number; page: number; pages: number }>(
        '/students',
        { query: { ...filter, discapacidad: filter.discapacidad === undefined ? undefined : String(filter.discapacidad) } }
      ),
    select: (res): StudentsPageResult => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
  });
}

export function useStudentFicha360(id: string | undefined) {
  return useQuery({
    queryKey: ['students', 'ficha360', id],
    queryFn: () => api.get<StudentFicha360>(`/students/${id}`),
    enabled: Boolean(id),
  });
}

export interface ImportacionResultado {
  total_filas: number;
  creados: number;
  fallidos: number;
  errores: Array<{ fila: number; numero_documento?: string; motivo: string }>;
}

export function useBulkImportStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<ImportacionResultado>('/students/bulk-import', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export interface UpsertStudentProfileInput {
  userId: string;
  lugar_expedicion?: string;
  fecha_nacimiento: string;
  genero?: Genero;
  eps?: string;
  regimen_salud?: RegimenSalud;
  rh?: GrupoSanguineo;
  alergias_condiciones?: string;
  direccion_residencia?: string;
  barrio_vereda?: string;
  municipio?: string;
  estrato?: number;
  grupo_etnico?: GrupoEtnico;
  victima_conflicto?: boolean;
  tiene_discapacidad?: boolean;
  tiene_talento_excepcional?: boolean;
  descripcion_inclusion?: string;
  institucion_procedencia?: string;
  autorizacion_datos_sensibles?: Pick<AutorizacionDatosSensibles, 'otorgada' | 'otorgado_por_nombre'>;
}

export function useUpsertStudentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...input }: UpsertStudentProfileInput) =>
      api.put<StudentProfile>(`/users/${userId}/student-profile`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['students', 'ficha360', variables.userId] });
    },
  });
}

export function useActualizarEstadoPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, estado }: { userId: string; estado: EstadoEstudiante }) =>
      api.patch<StudentProfile>(`/users/${userId}/student-profile/estado`, { estado }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['students', 'ficha360', variables.userId] });
    },
  });
}

export interface CrearEstudianteCompletoInput {
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombre: string;
  apellido: string;
  email?: string;
  password?: string;
  telefono?: string;
  lugar_expedicion?: string;
  fecha_nacimiento: string;
  genero?: Genero;
  direccion_residencia?: string;
  barrio_vereda?: string;
  municipio?: string;
  estrato?: number;
  eps?: string;
  regimen_salud?: RegimenSalud;
  rh?: GrupoSanguineo;
  alergias_condiciones?: string;
  grupo_etnico?: GrupoEtnico;
  victima_conflicto?: boolean;
  tiene_discapacidad?: boolean;
  tiene_talento_excepcional?: boolean;
  descripcion_inclusion?: string;
  institucion_procedencia?: string;
  autorizacion_datos_sensibles?: Pick<AutorizacionDatosSensibles, 'otorgada' | 'otorgado_por_nombre'>;

  // Acudiente (opcional)
  acudiente_tipo_documento?: TipoDocumento;
  acudiente_numero_documento?: string;
  acudiente_nombre?: string;
  acudiente_apellido?: string;
  acudiente_telefono_principal?: string;
  acudiente_telefono_secundario?: string;
  acudiente_email?: string;
  acudiente_parentesco?: Parentesco;
  acudiente_direccion?: string;
  acudiente_password?: string;
  acudiente_es_principal?: boolean;
  acudiente_autorizado_retiro?: boolean;
}

export interface CrearEstudianteCompletoResult {
  estudiante: User;
  perfil: StudentProfile;
  acudiente: Guardian | null;
  vinculo: unknown | null;
}

export function useCrearEstudianteCompleto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearEstudianteCompletoInput) =>
      api.post<CrearEstudianteCompletoResult>(
        '/students',
        input
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    },
  });
}
