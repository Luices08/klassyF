import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { PublicacionBoletin } from './useBoletin';

export interface FiltrosSabana {
  academic_year_id: string;
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  group_id?: string;
  /** Sin periodo = el cierre del año. */
  periodo_numero?: number;
}

export type FormatoSabana = 'excel' | 'pdf';

/** Los reportes son de acceso autenticado: se bajan con el token y se guardan con el nombre dado. */
export async function descargarReporte(ruta: string, consulta: Record<string, string | number | undefined>, nombreArchivo: string): Promise<void> {
  const parametros = new URLSearchParams();
  Object.entries(consulta).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== '') parametros.set(clave, String(valor));
  });
  const { url } = await api.downloadBlob(`/reportes/${ruta}?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function useExportarSabana() {
  return useMutation({
    mutationFn: ({ formato, filtros, nombreArchivo }: { formato: FormatoSabana; filtros: FiltrosSabana; nombreArchivo: string }) =>
      descargarReporte(`sabana/${formato}`, { ...filtros }, `${nombreArchivo}.${formato === 'excel' ? 'xlsx' : 'pdf'}`),
  });
}

// --- Listados de cierre (recuperación final, retirados) ---

export type TipoListado = 'recuperacion-final' | 'retirados' | 'servicio-social' | 'balance-inclusion';
export type FormatoListado = 'excel' | 'pdf';

export function useExportarListado() {
  return useMutation({
    mutationFn: ({ tipo, formato, filtros, nombreArchivo }: { tipo: TipoListado; formato: FormatoListado; filtros: { academic_year_id: string; sede_id?: string; jornada_id?: string; grade_id?: string; group_id?: string }; nombreArchivo: string }) =>
      descargarReporte(`${tipo}/${formato}`, { ...filtros }, `${nombreArchivo}.${formato === 'excel' ? 'xlsx' : 'pdf'}`),
  });
}

// --- Libro de calificaciones ---

export interface LibroCalificaciones {
  _id: string;
  codigo: string;
  anio: number;
  grado: string;
  sede: string;
  folio_inicial: number;
  folio_final: number;
  estado: 'VIGENTE' | 'ANULADO';
  anulacion: { motivo: string; fecha: string } | null;
  fecha_emision: string;
}

export function useLibrosCalificaciones(academicYearId: string) {
  return useQuery({
    queryKey: ['reportes', 'libros', academicYearId],
    queryFn: () => api.get<LibroCalificaciones[]>('/reportes/libro-calificaciones', { academic_year_id: academicYearId }),
    enabled: Boolean(academicYearId),
  });
}

export function useEmitirLibro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { academic_year_id: string; sede_id: string; grade_id: string }) => api.post<LibroCalificaciones>('/reportes/libro-calificaciones', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reportes', 'libros'] }),
  });
}

export function useAnularLibro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<LibroCalificaciones>(`/reportes/libro-calificaciones/${id}/anular`, { motivo }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reportes', 'libros'] }),
  });
}

export function useVerificarLibro() {
  return useMutation({ mutationFn: (id: string) => api.get<{ integro: boolean; codigo: string }>(`/reportes/libro-calificaciones/${id}/integridad`) });
}

export function useDescargarLibro() {
  return useMutation({ mutationFn: ({ id, codigo }: { id: string; codigo: string }) => descargarReporte(`libro-calificaciones/${id}/pdf`, {}, `libro-calificaciones-${codigo}.pdf`) });
}

// --- Plantilla de cierre para SIMAT ---

export type SituacionSimat = 'P' | 'R' | 'D' | 'G' | 'N';

export interface RevisionSimat {
  anio: number;
  alcance: string;
  revision: {
    total: number;
    por_situacion: Record<SituacionSimat, number>;
    listo: boolean;
    advertencias: Array<{ codigo: string; mensaje: string; cantidad: number; ejemplos: string[] }>;
  };
}

interface AlcanceSimat {
  academic_year_id: string;
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  group_id?: string;
}

/** Qué falta antes de subir el archivo. Se pide a mano (no cambia solo mientras se eligen filtros). */
export function useRevisarSimat() {
  return useMutation({ mutationFn: (alcance: AlcanceSimat) => api.get<RevisionSimat>('/reportes/simat/revision', { ...alcance }) });
}

export function useDescargarSimat() {
  return useMutation({
    mutationFn: ({ formato, alcance, nombreArchivo }: { formato: 'excel' | 'csv'; alcance: AlcanceSimat; nombreArchivo: string }) =>
      descargarReporte(`simat/${formato}`, { ...alcance }, `${nombreArchivo}.${formato === 'excel' ? 'xlsx' : 'csv'}`),
  });
}

// --- Informe final del año ---

export interface ReferenciaInformeFinal {
  academic_year_id: string;
  group_id: string;
}

export function useDescargarInformeFinal() {
  return useMutation({
    mutationFn: ({ referencia, nombreArchivo }: { referencia: ReferenciaInformeFinal & { student_id?: string }; nombreArchivo: string }) =>
      descargarReporte('informe-final/pdf', { ...referencia }, `${nombreArchivo}.pdf`),
  });
}

/** El estudiante o su acudiente: solo funciona cuando el administrador publicó el informe final de su grupo. */
export function descargarInformeFinalDeFamilia(academicYearId: string, studentId: string): Promise<void> {
  return descargarReporte('informe-final/mio/pdf', { academic_year_id: academicYearId, student_id: studentId }, 'informe-final-del-año.pdf');
}

export function usePublicacionInformeFinal(ref: Partial<ReferenciaInformeFinal>) {
  return useQuery({
    queryKey: ['reportes', 'informe-final', 'publicacion', ref.academic_year_id, ref.group_id],
    queryFn: () => api.get<PublicacionBoletin>('/reportes/informe-final/publicacion', { ...ref }),
    enabled: Boolean(ref.academic_year_id && ref.group_id),
  });
}

export function useEstablecerPublicacionInformeFinal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReferenciaInformeFinal & { publicado: boolean }) => api.put<PublicacionBoletin>('/reportes/informe-final/publicacion', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reportes', 'informe-final', 'publicacion'] }),
  });
}

// --- Reporte tipo C-600 (M30) y consolidado institucional ---

export interface ConteoSexo {
  H: number;
  M: number;
  O: number;
  total: number;
}

export interface ReporteC600 {
  generado_en: string;
  institucion: { nombre: string; codigo_dane: string };
  sede: { nombre: string; codigo_dane: string } | null;
  jornada: string | null;
  anio: number;
  fecha_inicio_anio: string;
  fecha_corte_edad: string;
  estado_datos: 'PRELIMINAR' | 'DEFINITIVO';
  leyenda: string;
  grados: Array<{ grado_id: string; grado: string; grado_numero: number }>;
  balance: {
    filas: Array<{ grado_id: string; grado: string; grado_numero: number; matricula_inicial: number; ingresados: number; retirados: number; matricula_final: number }>;
    total: { matricula_inicial: number; ingresados: number; retirados: number; matricula_final: number };
  };
  resultados: {
    filas: Array<{ grado_id: string; grado: string; grado_numero: number; promovidos: ConteoSexo; no_promovidos: ConteoSexo; desertores: ConteoSexo; sin_resultado: number }>;
    total: { promovidos: ConteoSexo; no_promovidos: ConteoSexo; desertores: ConteoSexo; sin_resultado: number };
  };
  edades: {
    filas: Array<{ clave: string; etiqueta: string; celdas: Record<string, ConteoSexo>; total: ConteoSexo }>;
    total_por_grado: Record<string, ConteoSexo>;
    sin_fecha_nacimiento: number;
  };
  hay_otro_sin_dato: boolean;
  firma: { cargo: string; nombre: string; fecha_expedicion: string };
  nombre_archivo: string;
}

export interface FiltrosC600 {
  academic_year_id: string;
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  /** `AAAA-MM-DD`; sin él, el inicio del periodo 1. */
  fecha_corte?: string;
}

/** La vista previa del reporte: la misma respuesta de la que salen el Excel y el PDF, así que lo que se ve es lo que baja. */
export function useReporteC600(filtros: FiltrosC600) {
  return useQuery({
    queryKey: ['reportes', 'c600', filtros],
    queryFn: () => api.get<ReporteC600>('/reportes/c600', { ...filtros }),
    enabled: Boolean(filtros.academic_year_id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useExportarC600() {
  return useMutation({
    mutationFn: ({ formato, filtros, nombreArchivo }: { formato: FormatoListado; filtros: FiltrosC600; nombreArchivo: string }) =>
      descargarReporte(`c600/${formato}`, { ...filtros }, `${nombreArchivo}.${formato === 'excel' ? 'xlsx' : 'pdf'}`),
  });
}

export function useExportarConsolidado() {
  return useMutation({
    mutationFn: ({ formato, filtros }: { formato: FormatoListado; filtros: { academic_year_id: string; sede_id?: string } }) =>
      descargarReporte(`consolidado/${formato}`, { ...filtros }, `consolidado-institucional.${formato === 'excel' ? 'xlsx' : 'pdf'}`),
  });
}
