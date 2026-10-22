import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

/** Noticias y eventos institucionales (módulo propio, aparte de los anuncios de M28). Todo se acota en el servidor al perfil de quien consulta. */

export type AlcanceNoticia = 'GRUPOS' | 'GRADOS' | 'SEDES' | 'INSTITUCION';
export type RolDestinoNoticia = 'DOCENTE' | 'ESTUDIANTE' | 'ACUDIENTE';
export type TonoCategoria = 'blue' | 'green' | 'orange' | 'red' | 'neutral';

/** Qué tan grande se ve una noticia en el mosaico (el servidor usa los mismos nombres). */
export type TamanoMosaico = 'PRINCIPAL' | 'DESTACADA' | 'ESTANDAR' | 'BREVE';

export interface Noticia {
  id: string;
  titulo: string;
  /** Bajada o entradilla. */
  subtitulo: string;
  /** El texto sin formato; el cuerpo con formato solo viaja en el detalle. */
  descripcion: string;
  categoria: { id: string; nombre: string; tono: TonoCategoria };
  fecha_inicio: string | null;
  fecha_fin: string | null;
  hora: string;
  lugar: string;
  afecta_clases: boolean;
  fijada: boolean;
  publicar_desde: string;
  alcance: AlcanceNoticia;
  /** Versión de la portada (para el caché); `null` = sin portada (solo las noticias anteriores a que fuera obligatoria). */
  imagen_version: number | null;
  tamano_mosaico: TamanoMosaico;
  /** Hacia dónde mira la portada en cada tarjeta (0 a 100 desde la esquina superior izquierda). */
  enfoque_x: number;
  enfoque_y: number;
  /** Quien la publicó. */
  autor: string;
}

/** Una noticia completa, con su cuerpo con formato (ya limpio en el servidor). Vacío en las anteriores: ahí se lee `descripcion`. */
export interface NoticiaDetalle extends Noticia {
  estado: 'PUBLICADA' | 'ARCHIVADA';
  contenido_html: string;
}

export interface NoticiaGestion extends Noticia {
  estado: 'PUBLICADA' | 'ARCHIVADA';
  vigente: boolean;
  /** Publicada pero aún no le llega la hora: se publicará y avisará sola. */
  programada: boolean;
  vence_el: string | null;
  roles_destino: RolDestinoNoticia[];
  sedes: Array<{ id: string; nombre: string }>;
  grados: Array<{ id: string; nombre: string }>;
  grupos: Array<{ id: string; nombre: string }>;
  creada_por: string;
  es_mia: boolean;
}

export interface PermisosNoticias {
  puede_publicar: boolean;
  alcance_maximo: AlcanceNoticia | null;
  /** `null` = todas las categorías. */
  categorias_ids: string[] | null;
  /** Las sedes que puede elegir; `null` = cualquiera. */
  sedes_ids: string[] | null;
  puede_administrar: boolean;
  puede_fijar: boolean;
}

export interface CategoriaNoticia {
  id: string;
  nombre: string;
  tono: TonoCategoria;
  estado: 'activo' | 'inactivo';
  noticias: number;
}

export interface Habilitacion {
  id: string;
  docente: { _id: string; nombre: string; apellido: string };
  alcance_maximo: AlcanceNoticia;
  categorias: Array<{ id: string; nombre: string }>;
  otorgada_por: string;
  createdAt: string;
}

export interface DatosNoticia {
  titulo: string;
  subtitulo?: string;
  /** El cuerpo con formato: el servidor lo limpia y de él deriva la descripción. */
  contenido_html: string;
  tamano_mosaico?: TamanoMosaico;
  enfoque_x?: number;
  enfoque_y?: number;
  /** La portada como data URI. Obligatoria al crear; al editar solo viaja si se cambia. */
  portada?: string;
  categoria_id: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  hora?: string;
  lugar?: string;
  afecta_clases?: boolean;
  roles_destino?: RolDestinoNoticia[];
  sedes_ids?: string[];
  grados_ids?: string[];
  grupos_ids?: string[];
  vence_el?: string | null;
  /** Cuándo se publica; sin él, ahora. Una fecha futura la deja programada. */
  publicar_desde?: string;
  fijada?: boolean;
}

export const ETIQUETA_ALCANCE: Record<AlcanceNoticia, string> = {
  INSTITUCION: 'Toda la institución',
  SEDES: 'Una o varias sedes',
  GRADOS: 'Uno o varios grados',
  GRUPOS: 'Uno o varios grupos',
};

export const ETIQUETA_ROL_DESTINO: Record<RolDestinoNoticia, string> = { DOCENTE: 'Docentes', ESTUDIANTE: 'Estudiantes', ACUDIENTE: 'Acudientes' };

// --- Lectura ---

/** Lo que le toca a quien consulta, vigente y ordenado (fijadas, eventos próximos y luego lo reciente). */
export function useNoticiasParaMi(limite = 50, habilitado = true) {
  return useQuery({
    queryKey: ['noticias', 'mias', limite],
    queryFn: () => api.get<Noticia[]>('/noticias/mias', { limite }),
    enabled: habilitado,
    staleTime: 60_000,
  });
}

/** Una noticia con su cuerpo: se pide al abrirla (los listados no lo traen) y respeta quién puede verla. */
export function useNoticiaDetalle(id: string | null) {
  return useQuery({ queryKey: ['noticias', 'detalle', id], queryFn: () => api.get<NoticiaDetalle>(`/noticias/${id}`), enabled: Boolean(id), staleTime: 30_000 });
}

export function usePermisosNoticias() {
  return useQuery({ queryKey: ['noticias', 'permisos'], queryFn: () => api.get<PermisosNoticias>('/noticias/permisos'), staleTime: 60_000 });
}

export function useNoticiasGestion(habilitado: boolean) {
  return useQuery({ queryKey: ['noticias', 'gestion'], queryFn: () => api.get<NoticiaGestion[]>('/noticias/gestion'), enabled: habilitado, staleTime: 15_000 });
}

export function useCategoriasNoticia(todas = false, habilitado = true) {
  return useQuery({
    queryKey: ['noticias', 'categorias', todas],
    queryFn: () => api.get<CategoriaNoticia[]>('/noticias/categorias', { todas: todas ? 'true' : undefined }),
    enabled: habilitado,
    staleTime: 60_000,
  });
}

export function useHabilitaciones(habilitado: boolean) {
  return useQuery({ queryKey: ['noticias', 'habilitaciones'], queryFn: () => api.get<Habilitacion[]>('/noticias/habilitaciones'), enabled: habilitado, staleTime: 15_000 });
}

// --- Escritura: toda mutación refresca el prefijo 'noticias' ---

function useInvalidarNoticias() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['noticias'] });
}

export function useCrearNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: (datos: DatosNoticia) => api.post<NoticiaGestion>('/noticias', datos), onSuccess: invalidar });
}

export function useActualizarNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: ({ id, ...datos }: Partial<DatosNoticia> & { id: string }) => api.patch<NoticiaGestion>(`/noticias/${id}`, datos), onSuccess: invalidar });
}

export function useArchivarNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: (id: string) => api.post<void>(`/noticias/${id}/archivar`), onSuccess: invalidar });
}

export function useCrearCategoriaNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: (datos: { nombre: string; tono?: TonoCategoria }) => api.post<CategoriaNoticia>('/noticias/categorias', datos), onSuccess: invalidar });
}

export function useActualizarCategoriaNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; nombre?: string; tono?: TonoCategoria; estado?: 'activo' | 'inactivo' }) => api.patch<CategoriaNoticia>(`/noticias/categorias/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useEliminarCategoriaNoticia() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: (id: string) => api.delete<void>(`/noticias/categorias/${id}`), onSuccess: invalidar });
}

export function useOtorgarHabilitacion() {
  const invalidar = useInvalidarNoticias();
  return useMutation({
    mutationFn: (datos: { docente_id: string; alcance_maximo: AlcanceNoticia; categorias_ids: string[] }) => api.post<Habilitacion>('/noticias/habilitaciones', datos),
    onSuccess: invalidar,
  });
}

export function useActualizarHabilitacion() {
  const invalidar = useInvalidarNoticias();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; alcance_maximo?: AlcanceNoticia; categorias_ids?: string[] }) => api.patch<Habilitacion>(`/noticias/habilitaciones/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useRevocarHabilitacion() {
  const invalidar = useInvalidarNoticias();
  return useMutation({ mutationFn: (id: string) => api.post<void>(`/noticias/habilitaciones/${id}/revocar`), onSuccess: invalidar });
}

// --- Portada: viaja con la noticia (data URI) y se pide con sesión ---

/**
 * La imagen de una noticia como dirección que el `<img>` puede usar. No hay una URL pública (en un evento puede haber niños en la foto): se pide con la sesión, así que
 * se baja el archivo y se usa su dirección local. La versión va en la clave, así al reemplazar la imagen se vuelve a pedir y nunca se ve una vieja.
 */
export function useImagenNoticia(id: string, version: number | null) {
  return useQuery({
    queryKey: ['noticias', 'imagen', id, version],
    queryFn: async () => (await api.downloadBlob(`/noticias/${id}/imagen?v=${version}`)).url,
    enabled: version !== null,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}
