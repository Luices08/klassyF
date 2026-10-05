import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Catálogos de la pantalla (el contrato lo fija el backend: constants/inclusion.ts) ---

export const ESTADOS_SOLICITUD_APOYO = ['PENDIENTE', 'EN_VALORACION', 'CONVERTIDA', 'DESCARTADA'] as const;
export type EstadoSolicitudApoyo = (typeof ESTADOS_SOLICITUD_APOYO)[number];
export const NOMBRES_ESTADO_SOLICITUD: Record<EstadoSolicitudApoyo, string> = {
  PENDIENTE: 'Pendiente',
  EN_VALORACION: 'En valoración',
  CONVERTIDA: 'Con expediente',
  DESCARTADA: 'Cerrada sin expediente',
};

export type OrigenSolicitudApoyo = 'MATRICULA' | 'PREINSCRIPCION' | 'DOCENTE' | 'CONVIVENCIA' | 'DIRECTO';
export const NOMBRES_ORIGEN: Record<OrigenSolicitudApoyo, string> = {
  MATRICULA: 'Matrícula',
  PREINSCRIPCION: 'Preinscripción',
  DOCENTE: 'Docente',
  CONVIVENCIA: 'Convivencia',
  DIRECTO: 'Orientación',
};

export const RESULTADOS_SOLICITUD = ['ABRIR_PIAR', 'PLAN_APOYO', 'SEGUIMIENTO_PSICOSOCIAL', 'RUTA_SALUD', 'DESCARTAR'] as const;
export type ResultadoSolicitud = (typeof RESULTADOS_SOLICITUD)[number];
export const NOMBRES_RESULTADO: Record<ResultadoSolicitud, string> = {
  ABRIR_PIAR: 'Abrir PIAR (discapacidad)',
  PLAN_APOYO: 'Abrir plan de apoyo pedagógico',
  SEGUIMIENTO_PSICOSOCIAL: 'Seguimiento psicosocial (orientación)',
  RUTA_SALUD: 'Orientar a la familia a la ruta de salud',
  DESCARTAR: 'Descartar',
};

export const ESTADOS_EXPEDIENTE = ['BORRADOR', 'EN_CONSTRUCCION', 'LISTO_PARA_ACUERDO', 'ACTIVO', 'CERRADO'] as const;
export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number];
export const NOMBRES_ESTADO_EXPEDIENTE: Record<EstadoExpediente, string> = {
  BORRADOR: 'Borrador',
  EN_CONSTRUCCION: 'En construcción',
  LISTO_PARA_ACUERDO: 'Listo para acuerdo',
  ACTIVO: 'Activo',
  CERRADO: 'Cerrado',
};

export type TipoExpediente = 'PIAR' | 'PLAN_APOYO';
export const NOMBRES_TIPO_EXPEDIENTE: Record<TipoExpediente, string> = { PIAR: 'PIAR', PLAN_APOYO: 'Plan de apoyo' };

export const CATEGORIAS_DISCAPACIDAD = [
  { codigo: 'POR_CONFIRMAR', nombre: 'Por confirmar' },
  { codigo: 'VISUAL_CEGUERA', nombre: 'Visual: ceguera' },
  { codigo: 'VISUAL_BAJA_VISION', nombre: 'Visual: baja visión diagnosticada' },
  { codigo: 'AUDITIVA_SORDERA', nombre: 'Auditiva: sordera profunda (usuario de LSC)' },
  { codigo: 'AUDITIVA_HIPOACUSIA', nombre: 'Auditiva: hipoacusia o baja audición' },
  { codigo: 'SORDOCEGUERA', nombre: 'Sordoceguera' },
  { codigo: 'INTELECTUAL', nombre: 'Intelectual (cognitiva)' },
  { codigo: 'FISICA', nombre: 'Física (movilidad)' },
  { codigo: 'PSICOSOCIAL', nombre: 'Psicosocial (mental)' },
  { codigo: 'SISTEMICA', nombre: 'Sistémica' },
  { codigo: 'MULTIPLE', nombre: 'Múltiple' },
  { codigo: 'TEA', nombre: 'Trastorno del espectro autista' },
] as const;

export const TIPOS_NECESIDAD_PLAN_APOYO = [
  { codigo: 'TDAH_INATENTO', nombre: 'TDAH: predominio inatento' },
  { codigo: 'TDAH_HIPERACTIVO_IMPULSIVO', nombre: 'TDAH: predominio hiperactivo-impulsivo' },
  { codigo: 'TDAH_MIXTO', nombre: 'TDAH: mixto' },
  { codigo: 'DIFICULTAD_LECTOESCRITURA', nombre: 'Dificultad de lectoescritura' },
  { codigo: 'DIFICULTAD_CALCULO', nombre: 'Dificultad de cálculo' },
  { codigo: 'REZAGO_PEDAGOGICO_TRANSITORIO', nombre: 'Rezago pedagógico transitorio' },
  { codigo: 'OTRA', nombre: 'Otra' },
] as const;

export const TIPOS_BARRERA = [
  { codigo: 'ACTITUDINAL', nombre: 'Actitudinal' },
  { codigo: 'COMUNICATIVA', nombre: 'Comunicativa' },
  { codigo: 'FISICA', nombre: 'Física o de infraestructura' },
  { codigo: 'PEDAGOGICA', nombre: 'Pedagógica o didáctica' },
  { codigo: 'SOCIAL_CONTEXTO', nombre: 'Social o del contexto' },
  { codigo: 'EVALUATIVA', nombre: 'Evaluativa' },
  { codigo: 'ORGANIZATIVA', nombre: 'Organizativa (tiempos)' },
] as const;

export const CATEGORIAS_AJUSTE = [
  { codigo: 'ACTIVIDADES', nombre: 'En las actividades' },
  { codigo: 'MATERIALES', nombre: 'En los materiales' },
  { codigo: 'ESPACIOS', nombre: 'En los espacios' },
  { codigo: 'COMUNICACION', nombre: 'Apoyos de comunicación' },
  { codigo: 'APOYOS_HUMANOS', nombre: 'Apoyos humanos' },
  { codigo: 'AYUDAS_TECNOLOGICAS', nombre: 'Ayudas tecnológicas' },
  { codigo: 'EVALUACION', nombre: 'En la evaluación' },
  { codigo: 'OTRO', nombre: 'Otro' },
] as const;

export const EFECTIVIDAD_AJUSTE = [
  { codigo: 'MUY_EFECTIVO', nombre: 'Muy efectivo' },
  { codigo: 'PARCIALMENTE_EFECTIVO', nombre: 'Parcialmente efectivo' },
  { codigo: 'NO_EFECTIVO', nombre: 'No efectivo' },
  { codigo: 'NO_APLICADO', nombre: 'No aplicado' },
] as const;
export type EfectividadAjuste = (typeof EFECTIVIDAD_AJUSTE)[number]['codigo'];

export const DIMENSIONES_TRANSVERSALES = [
  { codigo: 'SOCIALIZACION', nombre: 'Socialización' },
  { codigo: 'PARTICIPACION', nombre: 'Participación' },
  { codigo: 'AUTONOMIA', nombre: 'Autonomía' },
  { codigo: 'AUTOCONTROL', nombre: 'Autocontrol' },
] as const;

export const ACTORES_PMI = [
  { codigo: 'FAMILIA', nombre: 'Familia, cuidadores o con quienes vive' },
  { codigo: 'DOCENTES', nombre: 'Docentes' },
  { codigo: 'DIRECTIVOS', nombre: 'Directivos' },
  { codigo: 'ADMINISTRATIVOS', nombre: 'Administrativos' },
  { codigo: 'PARES', nombre: 'Pares (compañeros)' },
] as const;

export const FRECUENCIAS_COMPROMISO = [
  { codigo: 'DIARIA', nombre: 'Diaria' },
  { codigo: 'SEMANAL', nombre: 'Semanal' },
  { codigo: 'PERMANENTE', nombre: 'Permanente' },
] as const;

export const NIVELES_FORMACION = [
  { codigo: 'NINGUNO', nombre: 'Ninguno' },
  { codigo: 'PRIMARIA', nombre: 'Primaria' },
  { codigo: 'BACHILLERATO', nombre: 'Bachillerato' },
  { codigo: 'TECNICO', nombre: 'Técnico' },
  { codigo: 'TECNOLOGO', nombre: 'Tecnólogo' },
  { codigo: 'UNIVERSITARIO', nombre: 'Universitario' },
] as const;

export const ROLES_FIRMANTE = [
  { codigo: 'ACUDIENTE', nombre: 'Acudiente / responsable legal' },
  { codigo: 'ESTUDIANTE', nombre: 'Estudiante' },
  { codigo: 'DOCENTE', nombre: 'Docente' },
  { codigo: 'ORIENTADOR', nombre: 'Orientación' },
  { codigo: 'DIRECTIVO', nombre: 'Directivo' },
] as const;

export const nombreDe = (lista: readonly { codigo: string; nombre: string }[], codigo: string | null | undefined) =>
  lista.find((x) => x.codigo === codigo)?.nombre ?? codigo ?? '—';

// --- Tipos de las respuestas ---

export interface EstudianteResumen {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface SolicitudApoyo {
  _id: string;
  estado: EstadoSolicitudApoyo;
  origen: OrigenSolicitudApoyo;
  estudiante: EstudianteResumen;
  grupo: string;
  /** Ausentes para coordinación: ve la fila, no lo declarado. */
  motivo_declarado?: string;
  observacion?: string;
  aporta_soporte?: boolean;
  solicitada_por: string | null;
  resolucion: { resultado: ResultadoSolicitud; fecha: string; motivo?: string } | null;
  expediente_id: string | null;
  createdAt: string;
}

export interface MiSolicitud {
  _id: string;
  estado: EstadoSolicitudApoyo;
  estudiante: string;
  createdAt: string;
}

export interface ExpedienteFila {
  _id: string;
  estado: EstadoExpediente;
  /** Ausente para coordinación: la modalidad revela la condición del estudiante. */
  tipo?: TipoExpediente;
  estudiante: EstudianteResumen;
  grado: string;
  grupo: string;
  porcentaje_ajustes: number;
  sin_docente: number;
  plazo_vencido: boolean;
  fecha_limite_elaboracion: string | null;
  updatedAt: string;
}

export interface Completitud {
  total: number;
  completas: number;
  porcentaje: number;
  sin_docente: string[];
  pendientes: string[];
}

export interface PersonaHogar {
  nombre: string;
  ocupacion: string;
  nivel_educativo: string | null;
}

export interface AnexoInfoGeneral {
  salud: {
    afiliado_sistema_salud: boolean | null;
    lugar_atencion_emergencia: string;
    atendido_sector_salud: boolean | null;
    frecuencia_atencion: string;
    diagnostico_medico: string;
    terapias: { nombre: string; frecuencia: string }[];
    tratamiento_medico: string;
    medicamentos: { nombre: string; frecuencia_horario: string; en_horario_escolar: boolean }[];
    productos_apoyo: string[];
  };
  hogar: {
    madre: PersonaHogar;
    padre: PersonaHogar;
    cuidador: { nombre: string; parentesco: string; nivel_educativo: string | null; telefono: string; correo: string };
    numero_hermanos: number | null;
    lugar_que_ocupa: number | null;
    vive_con: string;
    quienes_apoyan_crianza: string;
    bajo_proteccion: boolean | null;
    subsidios: string;
  };
  educativo: {
    vinculado_otra_institucion: boolean | null;
    instituciones_previas: string;
    motivo_cambio: string;
    ultimo_grado_cursado: string;
    aprobo_ultimo_grado: boolean | null;
    informe_pedagogico_previo: boolean | null;
    procedencia_informe: string;
    programas_complementarios: string;
    medio_transporte: string;
    tiempo_desplazamiento: string;
  };
}

export interface Caracteristicas {
  descripcion_general: string;
  gustos_intereses: string;
  aspectos_que_le_desagradan: string;
  expectativas_estudiante: string;
  expectativas_familia: string;
  lo_que_hace_puede_requiere_apoyo: string;
  habilidades_competencias: string;
  valoracion_pedagogica: string;
  barreras_generales: string;
  recomendaciones_aula: string;
  pautas_evaluacion: string;
  alerta_seguridad_aula: string;
  recursos_necesarios: string;
  proyectos_especificos: string;
  otra_informacion: string;
  actividades_en_casa_receso: string;
}

export interface FichaPedagogica {
  gustos_intereses: string;
  lo_que_hace_puede_requiere_apoyo: string;
  habilidades_competencias: string;
  barreras_generales: string;
  recomendaciones_aula: string;
  pautas_evaluacion: string;
  alerta_seguridad_aula: string;
  pautas_aula_plan: string[];
  pautas_evaluacion_plan: string;
}

export interface Transversal {
  dimension: string;
  objetivo: string;
  barrera: string;
  ajuste: string;
  evaluacion: string;
}
export interface AccionPmi {
  actor: string;
  accion: string;
  estrategia: string;
}
export interface CompromisoFamilia {
  actividad: string;
  descripcion: string;
  frecuencia: string;
}
export interface PlanApoyo {
  tipo_necesidad: string | null;
  observacion_inicial: string;
  compromisos_casa: string;
  pautas_aula: string[];
  pautas_evaluacion: string;
}
export interface InformeAnual {
  logros: string;
  dificultades_persistentes: string;
  eficacia_de_ajustes: string;
  recomendaciones_grado_siguiente: string;
  ajustes_a_mantener: string;
}

export interface Consentimiento {
  otorgado: boolean;
  otorgado_por_nombre: string | null;
  parentesco: string | null;
  fecha: string | null;
  version_politica: string | null;
  revocado: { fecha: string; motivo: string } | null;
}

export interface Expediente {
  _id: string;
  estado: EstadoExpediente;
  version: number;
  anio: number | null;
  editable: boolean;
  fecha_limite_elaboracion: string | null;
  plazo_vencido: boolean;
  seguimientos_minimos: number;
  estudiante: { nombre: string; apellido: string; tipo_documento: string; numero_documento: string; edad: number | null; grado: string; grupo: string; sede: string; jornada: string };
  ficha_pedagogica: FichaPedagogica;
  permisos: { gestiona: boolean; clinico: boolean; ver_todos_los_ajustes: boolean };
  /** false para todo docente: no ve la modalidad (revelaría la condición). */
  modalidad_visible: boolean;
  /** Neutral: hay tabla de ajustes por asignatura (PIAR). */
  usa_ajustes: boolean;
  tipo?: TipoExpediente;
  aprobado?: { fecha: string } | null;
  cierre?: { fecha: string; motivo: string } | null;
  transversales?: Transversal[];
  pmi?: AccionPmi[];
  compromisos_familia?: CompromisoFamilia[];
  compromisos_aula?: string;
  informe_anual?: InformeAnual;
  completitud?: Completitud;
  pendientes_aprobacion?: string[];
  consentimiento_otorgado?: boolean;
  // Solo orientación y ADMIN:
  categoria_discapacidad?: string;
  consentimiento?: Consentimiento;
  anexo_info_general?: AnexoInfoGeneral;
  caracteristicas?: Caracteristicas;
  plan_apoyo?: PlanApoyo;
  soportes?: { _id: string; nombre: string; descripcion: string; fecha: string }[];
  salud_administrativa?: { eps: string | null; regimen_salud: string | null };
}

export interface Seguimiento {
  _id: string;
  periodo_numero: number;
  fecha: string;
  efectividad: EfectividadAjuste;
  observacion: string;
  nueva_accion: string;
}

export interface AjusteAsignatura {
  dba_ids: string[];
  objetivo_flexibilizado: string;
  barrera_asignatura: string;
  tipos_barrera: string[];
  ajuste_metodologico: string;
  ajuste_evaluativo: string;
  categorias_ajuste: string[];
  recursos: string;
  seguimientos: Seguimiento[];
  completo: boolean;
}

export interface FilaAjuste {
  subject_id: string;
  asignatura: string;
  area: string;
  area_id: string;
  docente: string | null;
  es_mia: boolean;
  puede_editar: boolean;
  ajuste: AjusteAsignatura | null;
}

export interface AjustesDeExpediente {
  seguimientos_minimos: number;
  estado_expediente: EstadoExpediente;
  grade_id: string;
  filas: FilaAjuste[];
}

export interface CatalogoDocumento {
  clave: string;
  nombre: string;
  numero_anexo: string | null;
  confidencial: boolean;
  firma_admin: boolean;
  emisible_en: EstadoExpediente[];
}

export interface DocumentoEmitido {
  _id: string;
  clave: string;
  nombre: string;
  numero_anexo: string | null;
  codigo: string;
  version: number;
  estado: 'EMITIDO' | 'FIRMADO' | 'SUSTITUIDO';
  fecha_emision: string;
  huella: string;
  confidencial: boolean;
  firmado: boolean;
  firma: { fecha: string; firmantes: { nombre: string; rol: string }[] } | null;
  desactualizado: boolean;
}

export interface DocumentosDeExpediente {
  catalogo: CatalogoDocumento[];
  documentos: DocumentoEmitido[];
  puede_emitir: boolean;
  puede_firmar_institucional: boolean;
}

export interface MiEstudianteConApoyo {
  expediente_id: string;
  estado: EstadoExpediente;
  estudiante: { student_id: string; nombre: string; apellido: string };
  grupo: string;
  es_director: boolean;
  mis_asignaturas: { subject_id: string; nombre: string; completo: boolean }[];
}

export interface ConfiguracionInclusion {
  plazo_elaboracion_dias: number;
  seguimientos_minimos_anio: number;
  retencion_anios: number | null;
  declaracion_establecimiento: string;
  declaracion_familia: string;
  version_politica_datos: string;
}

export interface GrupoInclusion {
  _id: string;
  nomenclatura: string;
  grado: string;
}
export interface EstudianteBuscado {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string;
}

// --- Consultas ---

function useInvalidarInclusion() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['inclusion'] });
  };
}

interface Pagina<T> {
  data: T[];
  total: number;
  pagina: number;
  limite: number;
}

export function useGruposInclusion() {
  return useQuery({ queryKey: ['inclusion', 'grupos'], queryFn: () => api.get<GrupoInclusion[]>('/inclusion/grupos'), staleTime: 60_000 });
}

export function useEstudiantesInclusion(group_id: string, q: string) {
  return useQuery({
    queryKey: ['inclusion', 'estudiantes', group_id, q],
    queryFn: () => api.get<EstudianteBuscado[]>('/inclusion/estudiantes', { group_id, q }),
    enabled: Boolean(group_id) || q.trim().length >= 3,
  });
}

export function useBandejaSolicitudes(estado: EstadoSolicitudApoyo | '', pagina: number) {
  return useQuery({
    queryKey: ['inclusion', 'solicitudes', estado, pagina],
    queryFn: () => api.raw<{ success: true } & Pagina<SolicitudApoyo>>('/inclusion/solicitudes', { query: { pagina, limite: 20, ...(estado ? { estado } : {}) } }),
    select: ({ data, total, pagina: p, limite }) => ({ data, total, pagina: p, limite }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useMisSolicitudes() {
  return useQuery({ queryKey: ['inclusion', 'mis-solicitudes'], queryFn: () => api.get<MiSolicitud[]>('/inclusion/solicitudes/mias') });
}

export function useCrearSolicitud() {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: (datos: { student_id: string; motivo_declarado: string; observacion?: string }) => api.post<{ _id: string }>('/inclusion/solicitudes', datos),
    onSuccess: invalidar,
  });
}

export function useValorarSolicitud() {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (id: string) => api.post<SolicitudApoyo>(`/inclusion/solicitudes/${id}/valorar`, {}), onSuccess: invalidar });
}

export function useResolverSolicitud() {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; resultado: ResultadoSolicitud; motivo: string; copiar_anterior?: boolean }) =>
      api.post<SolicitudApoyo>(`/inclusion/solicitudes/${id}/resolver`, datos),
    onSuccess: invalidar,
  });
}

export function useExpedientes(filtro: { estado?: EstadoExpediente | ''; tipo?: TipoExpediente | ''; q?: string }, pagina: number) {
  return useQuery({
    queryKey: ['inclusion', 'expedientes', filtro, pagina],
    queryFn: () =>
      api.raw<{ success: true } & Pagina<ExpedienteFila>>('/inclusion/expedientes', {
        query: { pagina, limite: 20, estado: filtro.estado || undefined, tipo: filtro.tipo || undefined, q: filtro.q?.trim() || undefined },
      }),
    select: ({ data, total, pagina: p, limite }) => ({ data, total, pagina: p, limite }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useAbrirExpediente() {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: (datos: { student_id: string; tipo: TipoExpediente; copiar_anterior?: boolean }) => api.post<{ _id: string }>('/inclusion/expedientes', datos),
    onSuccess: invalidar,
  });
}

export function useExpediente(id: string | undefined) {
  return useQuery({ queryKey: ['inclusion', 'expediente', id], queryFn: () => api.get<Expediente>(`/inclusion/expedientes/${id}`), enabled: Boolean(id), retry: false });
}

export type SeccionExpediente =
  | 'anexo-info'
  | 'caracteristicas'
  | 'categoria'
  | 'transversales'
  | 'pmi'
  | 'compromisos-familia'
  | 'compromisos-aula'
  | 'plan-apoyo'
  | 'informe-anual';

export function useGuardarSeccion(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ seccion, cuerpo }: { seccion: SeccionExpediente; cuerpo: unknown }) => api.patch<{ actualizado: string }>(`/inclusion/expedientes/${id}/${seccion}`, cuerpo),
    onSuccess: invalidar,
  });
}

export function useRegistrarConsentimiento(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: (datos: { otorgado_por_nombre: string; parentesco: string }) => api.post(`/inclusion/expedientes/${id}/consentimiento`, datos),
    onSuccess: invalidar,
  });
}

export function useRevocarConsentimiento(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (motivo: string) => api.post(`/inclusion/expedientes/${id}/consentimiento/revocar`, { motivo }), onSuccess: invalidar });
}

export function useCargarSoporte(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ archivo, descripcion }: { archivo: File; descripcion: string }) => {
      const formData = new FormData();
      formData.append('file', archivo);
      formData.append('descripcion', descripcion);
      return api.upload<{ soporte_id: string }>(`/inclusion/expedientes/${id}/soportes`, formData);
    },
    onSuccess: invalidar,
  });
}

/** Los archivos clínicos y los PDF se bajan con el token (nunca por URL directa) y se guardan con el nombre dado. */
export async function descargarArchivo(ruta: string, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(`/inclusion${ruta}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export type TransicionExpediente = 'iniciar' | 'aprobar' | 'devolver';

export function useTransicionExpediente(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (accion: TransicionExpediente) => api.post<{ estado: EstadoExpediente }>(`/inclusion/expedientes/${id}/${accion}`, {}), onSuccess: invalidar });
}

export function useCerrarExpediente(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (motivo: string) => api.post(`/inclusion/expedientes/${id}/cerrar`, { motivo }), onSuccess: invalidar });
}

export function useAjustes(id: string | undefined) {
  return useQuery({ queryKey: ['inclusion', 'ajustes', id], queryFn: () => api.get<AjustesDeExpediente>(`/inclusion/expedientes/${id}/ajustes`), enabled: Boolean(id), retry: false });
}

export interface DatosAjuste {
  dba_ids?: string[];
  objetivo_flexibilizado?: string;
  barrera_asignatura?: string;
  tipos_barrera?: string[];
  ajuste_metodologico?: string;
  ajuste_evaluativo?: string;
  categorias_ajuste?: string[];
  recursos?: string;
}

export function useGuardarAjuste(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ subject_id, ...datos }: DatosAjuste & { subject_id: string }) => api.put<AjusteAsignatura>(`/inclusion/expedientes/${id}/ajustes/${subject_id}`, datos),
    onSuccess: invalidar,
  });
}

export function useRegistrarSeguimiento(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ subject_id, ...datos }: { subject_id: string; periodo_numero: number; efectividad: EfectividadAjuste; observacion?: string; nueva_accion?: string }) =>
      api.post<AjusteAsignatura>(`/inclusion/expedientes/${id}/ajustes/${subject_id}/seguimientos`, datos),
    onSuccess: invalidar,
  });
}

export function useDocumentos(id: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['inclusion', 'documentos', id],
    queryFn: () => api.get<DocumentosDeExpediente>(`/inclusion/expedientes/${id}/documentos`),
    enabled: Boolean(id) && habilitado,
    retry: false,
  });
}

export function useEmitirDocumento(id: string) {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (clave: string) => api.post<{ _id: string; codigo: string; version: number }>(`/inclusion/expedientes/${id}/documentos`, { clave }), onSuccess: invalidar });
}

export function useFirmarDocumento() {
  const invalidar = useInvalidarInclusion();
  return useMutation({
    mutationFn: ({ id, archivo, firmantes }: { id: string; archivo: File; firmantes: { nombre: string; rol: string }[] }) => {
      const formData = new FormData();
      formData.append('file', archivo);
      formData.append('firmantes', JSON.stringify(firmantes));
      return api.upload<DocumentoEmitido>(`/inclusion/documentos/${id}/firmar`, formData);
    },
    onSuccess: invalidar,
  });
}

export function useVerificarIntegridad() {
  return useMutation({ mutationFn: (id: string) => api.get<{ codigo: string; integro: boolean }>(`/inclusion/documentos/${id}/integridad`) });
}

export function useMisEstudiantesConApoyo() {
  return useQuery({ queryKey: ['inclusion', 'mis-estudiantes'], queryFn: () => api.get<MiEstudianteConApoyo[]>('/inclusion/mis-estudiantes'), retry: false });
}

export function useConfiguracionInclusion() {
  return useQuery({ queryKey: ['inclusion', 'configuracion'], queryFn: () => api.get<ConfiguracionInclusion>('/inclusion/configuracion'), retry: false });
}

export function useActualizarConfiguracionInclusion() {
  const invalidar = useInvalidarInclusion();
  return useMutation({ mutationFn: (cambios: Partial<ConfiguracionInclusion>) => api.put<ConfiguracionInclusion>('/inclusion/configuracion', cambios), onSuccess: invalidar });
}
