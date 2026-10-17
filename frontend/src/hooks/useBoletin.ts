import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { NivelDesempeno } from '../types/domain';

export type TipoFraseBoletin = 'DESCRIPCION' | 'RECOMENDACION';

export interface EntregaBoletin {
  academic_year_id: string;
  periodo_numero: number;
  fecha_entrega: string;
}

// --- Diseño del boletín (mismo contrato que backend/src/constants/boletin.ts) ---

export const SECCIONES_BOLETIN = [
  'DATOS_ESTUDIANTE',
  'AREAS',
  'DIFICULTADES',
  'ESCALA',
  'ENTREGA',
  'CALENDARIO',
  'RECLAMACIONES',
  'COMPROMISOS',
  'PROMOCION',
  'FIRMAS',
] as const;
export type SeccionBoletin = (typeof SECCIONES_BOLETIN)[number];
export const POSICIONES_ESCUDO = ['IZQUIERDA', 'CENTRO', 'DERECHA', 'MARCA_DE_AGUA'] as const;
export type PosicionEscudo = (typeof POSICIONES_ESCUDO)[number];
export const PAPELES_BOLETIN = ['LETTER', 'A4'] as const;
export type PapelBoletin = (typeof PAPELES_BOLETIN)[number];
export const FUENTES_BOLETIN = ['SANS', 'SERIF', 'MONO'] as const;
export type FuenteBoletin = (typeof FUENTES_BOLETIN)[number];
export const TAMANOS_TEXTO_BOLETIN = ['PEQUENO', 'NORMAL', 'GRANDE'] as const;
export type TamanoTextoBoletin = (typeof TAMANOS_TEXTO_BOLETIN)[number];
export const ESCUDO_TAMANO_MINIMO = 30;
export const ESCUDO_TAMANO_MAXIMO = 120;
export const MAX_FIRMAS_BOLETIN = 4;
export const MAX_OPCIONES_PROMOCION = 5;
export const MAX_BYTES_ESCUDO = 500_000;

export const CLAVES_TEXTOS_BOLETIN = [
  'promedio_general',
  'documento',
  'grado',
  'grupo',
  'inasistencias',
  'justificadas',
  'injustificadas',
  'retardos',
  'puesto',
  'periodo_linea',
  'jornada',
  'sin_cerrar',
  'falla',
  'sin_malla',
  'informe_parcial',
  'informe_parcial_faltan',
  'escala_columna_1',
  'escala_columna_2',
  'escala_columna_3',
  'escala_equivalencia',
  'fecha_entrega',
  'calendario_sin_fecha',
  'dificultades_intro',
  'dificultades_ninguna',
  'compromisos_intro',
  'promocion_intro',
  'homologada',
  'exenta',
  'convencion_homologada',
  'convencion_exenta',
  'traslado_linea',
] as const;
export type ClaveTextoBoletin = (typeof CLAVES_TEXTOS_BOLETIN)[number];

export interface SeccionPlantilla {
  clave: SeccionBoletin;
  titulo: string;
  visible: boolean;
}

export interface FirmaBoletin {
  cargo: string;
  nombre: string;
  usa_director_grupo: boolean;
}

export interface PlantillaBoletin {
  titulo: string;
  subtitulo: string;
  mostrar_datos_institucion: boolean;
  mostrar_sede_jornada: boolean;
  escudo: { mostrar: boolean; posicion: PosicionEscudo; tamano: number; url: string | null };
  color_acento: string;
  papel: PapelBoletin;
  fuente: FuenteBoletin;
  tamano_texto: TamanoTextoBoletin;
  secciones: SeccionPlantilla[];
  estudiante: { documento: boolean; grado: boolean; grupo: boolean; inasistencias: boolean; promedio: boolean };
  asignaturas: { nota: boolean; desempeno: boolean; fallas: boolean; nota_area: boolean; componentes: boolean; descripcion: boolean; recomendacion: boolean; observacion: boolean };
  rotulos: { componentes: string; descripcion: string; recomendacion: string; observacion: string };
  textos: Record<ClaveTextoBoletin, string>;
  texto_apoyo: string;
  compromisos_lineas: number;
  promocion_opciones: string[];
  firmas: FirmaBoletin[];
  pie_texto: string;
}

export interface ConfiguracionBoletin {
  canal_reclamaciones: string;
  mostrar_puesto: boolean;
  /** SIEE: el boletín parcial de retiro incluye las notas de corte del periodo en curso (provisionales). */
  incluir_corte_en_retiro: boolean;
  /** SIEE: el boletín parcial de retiro solo se entrega con el paz y salvo de salida aprobado. */
  exigir_paz_y_salvo_en_retiro: boolean;
  entregas: EntregaBoletin[];
  /** Siempre completa: lo que el colegio no personalizó viene con el diseño original. */
  plantilla: PlantillaBoletin;
}

export interface FraseBoletin {
  nivel: NivelDesempeno;
  tipo: TipoFraseBoletin;
  texto: string;
}

export interface ObservacionBoletin {
  student_id: string;
  nombre_completo: string;
  documento: string;
  texto: string;
}

export function useConfiguracionBoletin() {
  return useQuery({
    queryKey: ['boletines', 'configuracion'],
    queryFn: () => api.get<ConfiguracionBoletin>('/boletines/configuracion'),
    staleTime: 60_000,
  });
}

export function useActualizarConfiguracionBoletin() {
  const queryClient = useQueryClient();
  return useMutation({
    // `plantilla: {}` vuelve al diseño original: el servidor completa lo que falte.
    mutationFn: (cambios: Partial<Omit<ConfiguracionBoletin, 'plantilla'>> & { plantilla?: Partial<PlantillaBoletin> }) =>
      api.patch<ConfiguracionBoletin>('/boletines/configuracion', cambios),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boletines'] });
      void queryClient.invalidateQueries({ queryKey: ['report-card'] });
    },
  });
}

export function useFrasesBoletin() {
  return useQuery({
    queryKey: ['boletines', 'frases'],
    queryFn: () => api.get<FraseBoletin[]>('/boletines/frases'),
    staleTime: 60_000,
  });
}

export function useGuardarFraseBoletin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frase: FraseBoletin) => api.put<FraseBoletin>('/boletines/frases', frase),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boletines', 'frases'] });
      void queryClient.invalidateQueries({ queryKey: ['report-card'] });
    },
  });
}

interface ReferenciaObservaciones {
  teacherAssignmentId: string | undefined;
  periodoNumero: number | undefined;
}

export function useObservacionesBoletin({ teacherAssignmentId, periodoNumero }: ReferenciaObservaciones) {
  return useQuery({
    queryKey: ['boletines', 'observaciones', teacherAssignmentId, periodoNumero],
    queryFn: () =>
      api.get<ObservacionBoletin[]>('/boletines/observaciones', {
        teacher_assignment_id: teacherAssignmentId,
        periodo_numero: periodoNumero,
      }),
    enabled: Boolean(teacherAssignmentId && periodoNumero),
  });
}

export function useGuardarObservacionesBoletin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { teacherAssignmentId: string; periodoNumero: number; observaciones: Array<{ student_id: string; texto: string }> }) =>
      api.put<{ guardadas: number; eliminadas: number }>('/boletines/observaciones', {
        teacher_assignment_id: input.teacherAssignmentId,
        periodo_numero: input.periodoNumero,
        observaciones: input.observaciones,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boletines', 'observaciones'] });
      void queryClient.invalidateQueries({ queryKey: ['report-card'] });
    },
  });
}

// --- Quién de la familia ve el boletín ---

export type OrigenAccesoBoletin = 'EXCEPCION' | 'GRUPO' | 'SIN_PUBLICAR';

export interface EstudiantePublicacion {
  student_id: string;
  nombre_completo: string;
  documento: string;
  visible: boolean;
  origen: OrigenAccesoBoletin;
}

export interface PublicacionBoletin {
  publicado: boolean;
  publicado_at: string | null;
  estudiantes: EstudiantePublicacion[];
}

export interface ReferenciaPublicacion {
  group_id: string;
  academic_year_id: string;
  periodo_numero: number;
}

export function usePublicacionBoletin(ref: Partial<ReferenciaPublicacion>) {
  const completa = Boolean(ref.group_id && ref.academic_year_id && ref.periodo_numero);
  return useQuery({
    queryKey: ['boletines', 'publicacion', ref.group_id, ref.academic_year_id, ref.periodo_numero],
    queryFn: () => api.get<PublicacionBoletin>('/boletines/publicacion', { ...ref }),
    enabled: completa,
  });
}

export function useEstablecerPublicacionGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReferenciaPublicacion & { publicado: boolean }) => api.put<PublicacionBoletin>('/boletines/publicacion', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['boletines', 'publicacion'] }),
  });
}

export function useEstablecerAccesoEstudiante() {
  const queryClient = useQueryClient();
  return useMutation({
    // `permitir: null` quita la excepción y el estudiante vuelve a valer lo que decidió el grupo.
    mutationFn: (input: ReferenciaPublicacion & { student_id: string; permitir: boolean | null }) =>
      api.put<PublicacionBoletin>('/boletines/publicacion/estudiante', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['boletines', 'publicacion'] }),
  });
}

/** El PDF de muestra (datos inventados, configuración real). Con `borrador`, el diseño que se está editando aún sin guardar. */
export const cargarPdfMuestra = (borrador?: PlantillaBoletin) =>
  api.downloadBlob('/boletines/muestra/pdf', { method: 'POST', body: borrador ? { plantilla: borrador } : {} });
