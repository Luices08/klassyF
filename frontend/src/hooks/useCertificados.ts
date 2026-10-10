import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Catálogos de la pantalla (el contrato lo fija el backend: constants/certificados.ts) ---

/** La clave de un tipo de documento: es un dato del colegio (se crean, editan y eliminan), no una lista fija. */
export type ClaveCertificado = string;
export type FuenteCertificado = 'VALORACIONES' | 'DEPENDENCIAS';
export type EstadoTipoCertificado = 'BORRADOR' | 'ACTIVO' | 'ARCHIVADO';
export const CLAVE_DESTINATARIO_OTRO = 'OTRO';
export type ElementoAutenticacion = 'rectoria' | 'secretaria' | 'sello';
export type ModoElemento = 'NO_APLICA' | 'OPCIONAL_APAGADO' | 'OPCIONAL_ENCENDIDO' | 'OBLIGATORIO';
export type EstadoCertificado = 'VIGENTE' | 'ANULADO';

export const ELEMENTOS_AUTENTICACION: ElementoAutenticacion[] = ['rectoria', 'secretaria', 'sello'];
export const ETIQUETA_ELEMENTO: Record<ElementoAutenticacion, string> = {
  rectoria: 'Firma de Rectoría',
  secretaria: 'Firma de Secretaría Académica',
  sello: 'Sello institucional',
};
export const MODOS_ELEMENTO: { codigo: ModoElemento; nombre: string }[] = [
  { codigo: 'OPCIONAL_ENCENDIDO', nombre: 'Opcional · encendido' },
  { codigo: 'OPCIONAL_APAGADO', nombre: 'Opcional · apagado' },
  { codigo: 'OBLIGATORIO', nombre: 'Obligatorio' },
  { codigo: 'NO_APLICA', nombre: 'No aplica' },
];

/** Solo los estados con los que se expide algo (la matrícula formalizada o retirada). */
export const ETIQUETA_ESTADO_MATRICULA: Record<string, string> = {
  MATRICULADO_CONDICIONAL: 'Matriculado (condicional)',
  MATRICULADO_DEFINITIVO: 'Matriculado (definitivo)',
  RETIRADO: 'Retirado',
};

export interface EstadoDeElemento {
  valor_inicial: boolean;
  bloqueado: boolean;
  obligatorio: boolean;
  disponible: boolean;
  motivo: string | null;
}

export interface FirmanteConfigurado {
  usuario_id: string | null;
  nombre: string | null;
  cargo: string;
  tiene_imagen: boolean;
  /** Hay imagen configurada pero su archivo no está en el servidor: hay que volver a cargarla. */
  imagen_faltante: boolean;
}

/** De dónde toma la entidad una opción del selector (la EPS que M03 tiene del estudiante). */
export type FuenteEntidad = 'EPS';

export interface OpcionDestinatario {
  clave: string;
  etiqueta: string;
  fuente_entidad: FuenteEntidad | null;
}

export interface DependenciaPazYSalvo {
  /** Una dependencia nueva todavía no tiene clave: la asigna el servidor al guardar. */
  clave?: string;
  nombre: string;
  activa: boolean;
}

/** Lo que el usuario en sesión puede hacer en «Firmas y sellos»; lo decide el servidor, la pantalla solo lo refleja. */
export interface PermisosCertificados {
  imagen: Record<ElementoAutenticacion, boolean>;
  designar: { rectoria: boolean; secretaria: boolean };
  ajustes: boolean;
}

export interface ConfiguracionCertificados {
  rectoria: FirmanteConfigurado;
  secretaria: FirmanteConfigurado;
  sello: { tiene_imagen: boolean; imagen_faltante: boolean };
  permitir_firma_rectoria_a_secretaria: boolean;
  /** Por clave de tipo; solo los tipos que no están archivados. */
  politica: Record<ClaveCertificado, Record<ElementoAutenticacion, ModoElemento>>;
  paz_y_salvo: { dependencias: (DependenciaPazYSalvo & { clave: string })[] };
  puede: PermisosCertificados;
  tipos: {
    clave: ClaveCertificado;
    nombre: string;
    descripcion: string;
    estado: EstadoTipoCertificado;
    /** Lo que el documento pide al expedir: dependencias confirmadas, valoraciones y promoción. */
    fuentes: FuenteCertificado[];
    destinatarios: OpcionDestinatario[];
    elementos: Record<ElementoAutenticacion, EstadoDeElemento>;
  }[];
}

export interface CambiosConfiguracionCertificados {
  rectoria?: { usuario_id?: string | null; cargo?: string };
  secretaria?: { usuario_id?: string | null; cargo?: string };
  permitir_firma_rectoria_a_secretaria?: boolean;
  politica?: Partial<Record<ClaveCertificado, Partial<Record<ElementoAutenticacion, ModoElemento>>>>;
  paz_y_salvo?: { dependencias: DependenciaPazYSalvo[] };
}

export interface MatriculaExpedible {
  _id: string;
  anio: number;
  grado: string;
  nivel: string | null;
  grupo: string;
  sede: string;
  jornada: string | null;
  horario: { inicio: string; fin: string } | null;
  estado: string;
  folio_matricula: string | null;
  numero_libro: number | null;
  numero_folio: number | null;
  fecha_matricula: string;
  tipo_ingreso: string | null;
  tipos: ClaveCertificado[];
  /** Documentos que esta matrícula solo admite como vista previa, con el porqué (falta un módulo de origen). */
  restricciones: Partial<Record<ClaveCertificado, string>>;
}

export interface CertificadoExpedido {
  _id: string;
  tipo: ClaveCertificado;
  nombre_tipo: string;
  codigo: string;
  estado: EstadoCertificado;
  student_id: string;
  estudiante: string;
  documento: string;
  grado: string;
  anio: number | null;
  destinatario: string | null;
  firmas: Record<ElementoAutenticacion, boolean>;
  fecha_emision: string;
  emitido_por: string | null;
  /** A quién se entregó (los documentos anteriores a este registro no lo tienen). */
  solicitante: { tipo: TipoSolicitante; nombre: string; detalle: string | null } | null;
  huella: string;
  anulacion: { fecha: string; motivo: string } | null;
}

export type TipoSolicitante = 'ACUDIENTE' | 'ESTUDIANTE' | 'TERCERO' | 'AUTORIDAD';
export const ETIQUETA_SOLICITANTE: Record<TipoSolicitante, string> = {
  ACUDIENTE: 'Acudiente vinculado',
  ESTUDIANTE: 'El mismo estudiante (mayor de edad)',
  TERCERO: 'Tercero con autorización',
  AUTORIDAD: 'Entidad o autoridad (con oficio)',
};
export const ETIQUETA_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

/** A quién se entrega el documento: queda registrado, no se imprime. El servidor comprueba lo que cada tipo exige. */
export interface SolicitanteEntrada {
  tipo: TipoSolicitante;
  guardian_id?: string | null;
  nombre?: string;
  tipo_documento?: string;
  numero_documento?: string;
  /** Relación con el estudiante (tercero) o número de oficio (autoridad). */
  detalle?: string;
  presento_autorizacion?: boolean;
}

export interface AcudienteDeFicha {
  guardian_id: string;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  parentesco: string;
  telefono: string;
  es_principal: boolean;
  autorizado_retiro: boolean;
}

/** Lo que el sistema sabe del estudiante para expedir (M01/M03/M04): nada se vuelve a digitar. */
export interface FichaEstudiante {
  estudiante: {
    _id: string;
    nombre: string;
    apellido: string;
    tipo_documento: string;
    numero_documento: string;
    lugar_expedicion: string | null;
    mayor_de_edad: boolean;
    eps: { valor: string | null; disponible: boolean; motivo: string | null };
  };
  acudientes: AcudienteDeFicha[];
  /** Lo que le falta al sistema para que los documentos salgan completos. */
  faltantes: string[];
  matriculas: MatriculaExpedible[];
}

export interface EntradaExpedicion {
  enrollment_id: string;
  tipo: ClaveCertificado;
  /** Lo elegido en el selector del documento; `otro` es el texto cuando elige «Otro». */
  destinatario?: { clave: string; otro?: string | null } | null;
  /** Solo paz y salvo: claves de las dependencias confirmadas sin pendientes. */
  dependencias?: string[];
  firmas: Partial<Record<ElementoAutenticacion, boolean>>;
  /** Obligatorio al expedir; la vista previa no lo pide. */
  solicitante?: SolicitanteEntrada | null;
}

export interface FiltroCertificados {
  student_id?: string;
  tipo?: ClaveCertificado;
  estado?: EstadoCertificado;
  pagina?: number;
}

// --- Configuración (firmas y sellos) ---

export function useConfiguracionCertificados() {
  return useQuery({ queryKey: ['certificados', 'configuracion'], queryFn: () => api.get<ConfiguracionCertificados>('/certificados/configuracion') });
}

export function useActualizarConfiguracionCertificados() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosConfiguracionCertificados) => api.put<ConfiguracionCertificados>('/certificados/configuracion', cambios),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export function useSubirImagenCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ elemento, archivo }: { elemento: ElementoAutenticacion; archivo: File }) => {
      const formData = new FormData();
      formData.append('file', archivo);
      return api.upload<ConfiguracionCertificados>(`/certificados/configuracion/imagenes/${elemento}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export function useQuitarImagenCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (elemento: ElementoAutenticacion) => api.delete<ConfiguracionCertificados>(`/certificados/configuracion/imagenes/${elemento}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

/** La imagen es de acceso autenticado: se baja con el token y se muestra como blob, nunca por URL directa. */
export function useImagenCertificado(elemento: ElementoAutenticacion, tieneImagen: boolean) {
  return useQuery({
    queryKey: ['certificados', 'imagen', elemento, tieneImagen],
    queryFn: async () => (await api.downloadBlob(`/certificados/configuracion/imagenes/${elemento}`)).url,
    enabled: tieneImagen,
    staleTime: 0,
  });
}

// --- Expedición ---

export function useMatriculasExpedibles(studentId: string | undefined) {
  return useQuery({
    queryKey: ['certificados', 'matriculas', studentId],
    queryFn: () => api.get<FichaEstudiante>(`/certificados/estudiantes/${studentId}/matriculas`),
    enabled: Boolean(studentId),
  });
}

export function useExpedirCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaExpedicion) => api.post<CertificadoExpedido>('/certificados', entrada),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados', 'lista'] });
    },
  });
}

/** El PDF de la vista previa no guarda nada: es el mismo documento sin consecutivo, huella ni QR. Se muestra en la propia pantalla. */
export const descargarVistaPrevia = (entrada: EntradaExpedicion) => api.downloadBlob('/certificados/vista-previa', { method: 'POST', body: entrada });

export const descargarPdfCertificado = (id: string) => api.downloadBlob(`/certificados/${id}/pdf`);

// --- Historial ---

export function useCertificados(filtro: FiltroCertificados) {
  return useQuery({
    queryKey: ['certificados', 'lista', filtro],
    queryFn: () =>
      api.raw<{ success: true; data: CertificadoExpedido[]; total: number; page: number; pages: number }>('/certificados', { query: { ...filtro, limite: 15 } }),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
  });
}

export function useAnularCertificado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<CertificadoExpedido>(`/certificados/${id}/anular`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados', 'lista'] });
    },
  });
}

export function useVerificarIntegridadCertificado() {
  return useMutation({ mutationFn: (id: string) => api.get<{ codigo: string; estado: EstadoCertificado; integro: boolean }>(`/certificados/${id}/integridad`) });
}

// --- Verificación pública (sin sesión) ---

export interface ResultadoVerificacion {
  resultado: 'VALIDO' | 'VIGENCIA_CUMPLIDA' | 'ANULADO' | 'NO_VERIFICABLE';
  /** La vigencia que declara el documento (días y último día); sin vigencia, ambos null. */
  vigencia?: { dias: number | null; hasta: string | null };
  tipo: string;
  codigo: string;
  fecha_emision: string;
  institucion: string;
  estudiante?: string;
  documento?: string;
  anulado_el?: string | null;
  mensaje?: string;
}

export interface ConsultaVerificacion {
  token?: string;
  codigo?: string;
  clave?: string;
}

export function useVerificacionPublica(consulta: ConsultaVerificacion | null) {
  return useQuery({
    queryKey: ['public', 'certificados', 'verificar', consulta],
    queryFn: () => api.get<ResultadoVerificacion>('/public/certificados/verificar', { ...consulta }),
    enabled: consulta !== null,
    retry: false,
    staleTime: 0,
  });
}

// --- Plantillas (solo ADMIN) ---

export type EstiloBloque = 'PREAMBULO' | 'FORMULA' | 'CUERPO' | 'DESTACADO' | 'TABLA_NOTAS';
export const ETIQUETA_ESTILO_BLOQUE: Record<EstiloBloque, string> = {
  PREAMBULO: 'Quién certifica (centrado)',
  FORMULA: 'Fórmula (HACE CONSTAR / CERTIFICA)',
  CUERPO: 'Párrafo',
  DESTACADO: 'Párrafo destacado',
  TABLA_NOTAS: 'Tabla de valoraciones (la entrega el módulo de notas)',
};

export interface BloquePlantilla {
  id: string;
  estilo: EstiloBloque;
  texto: string;
  condicion: { variable: string; tipo: 'HAY' | 'NO_HAY' } | null;
  activo: boolean;
}

export interface OpcionDestinatarioEditable {
  clave: string;
  etiqueta: string;
  frase: string;
  /** Si la opción toma la entidad de otro módulo, su frase lleva {entidad}. */
  fuente_entidad?: FuenteEntidad | null;
}

export interface ContenidoPlantilla {
  titulo: string;
  bloques: BloquePlantilla[];
  destinatarios: OpcionDestinatarioEditable[];
  frase_otro: string;
  vigencia_dias: number | null;
}

export interface VariableCertificado {
  clave: string;
  etiqueta: string;
  origen: string;
  ejemplo: string;
  /** Solo tiene sentido en los tipos que usan esa fuente de datos. */
  fuente?: FuenteCertificado;
}

export interface PlantillaVigente extends ContenidoPlantilla {
  tipo: ClaveCertificado;
  nombre: string;
  estado_tipo: EstadoTipoCertificado;
  fuentes: FuenteCertificado[];
  version: number;
  nota: string;
  publicada_at: string;
  requisitos: { variables: Array<string | string[]>; bloques: string[]; fuente: string };
}

export interface VersionPlantilla {
  version: number;
  estado: 'VIGENTE' | 'ARCHIVADA';
  nota: string;
  hash: string;
  publicada_at: string;
  publicada_por: string | null;
}

export function usePlantillasCertificados() {
  return useQuery({
    queryKey: ['certificados', 'plantillas'],
    queryFn: () => api.get<{ plantillas: PlantillaVigente[]; variables: VariableCertificado[] }>('/certificados/plantillas'),
  });
}

export function useVersionesPlantilla(tipo: ClaveCertificado) {
  return useQuery({ queryKey: ['certificados', 'plantillas', 'versiones', tipo], queryFn: () => api.get<VersionPlantilla[]>(`/certificados/plantillas/${tipo}/versiones`) });
}

export function usePublicarPlantilla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, contenido, nota }: { tipo: ClaveCertificado; contenido: ContenidoPlantilla; nota: string }) => api.put<{ tipo: ClaveCertificado; version: number }>(`/certificados/plantillas/${tipo}`, { ...contenido, nota }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export function useRestablecerPlantilla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tipo: ClaveCertificado) => api.post<{ tipo: ClaveCertificado; version: number }>(`/certificados/plantillas/${tipo}/restablecer`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

/** El PDF de un borrador de plantilla con un estudiante inventado: no guarda nada. */
export const descargarVistaPreviaPlantilla = (tipo: ClaveCertificado, contenido: ContenidoPlantilla) =>
  api.downloadBlob(`/certificados/plantillas/${tipo}/vista-previa`, { method: 'POST', body: contenido });

// --- Tipos de documento (Secretaría y ADMIN) ---

export const ETIQUETA_FUENTE: Record<FuenteCertificado, { nombre: string; descripcion: string }> = {
  VALORACIONES: { nombre: 'Valoraciones y promoción', descripcion: 'Incluye la tabla de notas finales y el concepto de promoción. Solo se expide con todas las notas definitivas.' },
  DEPENDENCIAS: { nombre: 'Dependencias (paz y salvo)', descripcion: 'Al expedir se confirma que no hay pendientes en cada dependencia activa.' },
};

export interface PermisosTipo {
  editar: boolean;
  editarPlantilla: boolean;
  activar: boolean;
  archivar: boolean;
  eliminar: boolean;
}

export interface TipoCertificado {
  clave: ClaveCertificado;
  nombre: string;
  descripcion: string;
  prefijo: string;
  estados_matricula: string[];
  fuentes: FuenteCertificado[];
  variables_obligatorias: string[];
  estado: EstadoTipoCertificado;
  orden: number;
  /** Documentos ya expedidos de este tipo: si hay alguno, no se elimina (se archiva). */
  emitidos: number;
  puede: PermisosTipo;
}

export interface ListaTiposCertificado {
  tipos: TipoCertificado[];
  estados_matricula: string[];
  variables: Array<{ clave: string; etiqueta: string; fuente: FuenteCertificado | null }>;
  maximo: number;
}

export interface EntradaTipoCertificado {
  nombre: string;
  descripcion?: string;
  prefijo: string;
  estados_matricula: string[];
  fuentes: FuenteCertificado[];
}

export type CambiosTipoCertificado = Partial<EntradaTipoCertificado> & { variables_obligatorias?: string[] };

export function useTiposCertificado() {
  return useQuery({ queryKey: ['certificados', 'tipos'], queryFn: () => api.get<ListaTiposCertificado>('/certificados/tipos') });
}

/** Un tipo cambia lo que ofrece la expedición, la política de firmas y los textos: se refresca todo lo de certificados. */
function useMutacionDeTipo<T, V>(mutationFn: (v: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}

export const useCrearTipoCertificado = () => useMutacionDeTipo((entrada: EntradaTipoCertificado) => api.post<TipoCertificado>('/certificados/tipos', entrada));
export const useActualizarTipoCertificado = () =>
  useMutacionDeTipo(({ clave, cambios }: { clave: ClaveCertificado; cambios: CambiosTipoCertificado }) => api.patch<TipoCertificado>(`/certificados/tipos/${clave}`, cambios));
export const useActivarTipoCertificado = () => useMutacionDeTipo((clave: ClaveCertificado) => api.post<TipoCertificado>(`/certificados/tipos/${clave}/activar`, {}));
export const useArchivarTipoCertificado = () => useMutacionDeTipo((clave: ClaveCertificado) => api.post<TipoCertificado>(`/certificados/tipos/${clave}/archivar`, {}));
export const useEliminarTipoCertificado = () => useMutacionDeTipo((clave: ClaveCertificado) => api.delete<{ clave: string }>(`/certificados/tipos/${clave}`));

/** El texto ya resuelto con datos de muestra para la vista en vivo del editor; los problemas y datos faltantes vienen aparte (no es un error). */
export interface RenderPlantilla {
  titulo: string;
  encabezado: { institucion: string; codigo_dane: string; nit: string; resolucion_aprobacion: string; sede: string; jornada: string; anio: number | null; ciudad?: string | null };
  bloques: Array<{ estilo: EstiloBloque; texto: string }>;
  tabla: { columnas: string[]; filas: Array<{ nivel: 'AREA' | 'ASIGNATURA'; celdas: string[] }>; pie: string } | null;
  problemas: string[];
  faltantes: string[];
}

/** Pide la vista en vivo del borrador (liviana, sin PDF). Conserva la anterior mientras llega la nueva para que no parpadee. */
export function useRenderPlantilla(tipo: ClaveCertificado, contenido: ContenidoPlantilla) {
  return useQuery({
    queryKey: ['certificados', 'plantillas', 'render', tipo, contenido],
    queryFn: () => api.post<RenderPlantilla>(`/certificados/plantillas/${tipo}/render`, contenido),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  });
}

// --- Anulación masiva por elemento comprometido (solo ADMIN) ---

export interface ImagenUsada {
  elemento: ElementoAutenticacion;
  hash: string;
  huella: string;
  /** Documentos vigentes que la estamparon. */
  documentos: number;
  desde: string;
  hasta: string;
  es_la_actual: boolean;
}

export interface CriterioRevocacion {
  elemento: ElementoAutenticacion;
  imagen_hash: string;
  desde?: string | null;
  hasta?: string | null;
  tipo?: ClaveCertificado | null;
}

export function useImagenesUsadas(habilitado: boolean) {
  return useQuery({ queryKey: ['certificados', 'revocacion', 'imagenes'], queryFn: () => api.get<ImagenUsada[]>('/certificados/revocacion/imagenes'), enabled: habilitado });
}

export function usePreviaRevocacion(criterio: CriterioRevocacion | null) {
  return useQuery({
    queryKey: ['certificados', 'revocacion', 'previa', criterio],
    queryFn: () => api.post<{ documentos: number }>('/certificados/revocacion/previa', criterio),
    enabled: criterio !== null,
    staleTime: 0,
  });
}

export function useRevocarPorElemento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: CriterioRevocacion & { motivo: string; confirm_password: string }) => api.post<{ anulados: number }>('/certificados/revocacion', entrada),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['certificados'] });
    },
  });
}
