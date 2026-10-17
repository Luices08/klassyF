import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /promocion) ---

export type MomentoPromocion = 'CIERRE' | 'TRAS_RECUPERACION';
export type UnidadPromocion = 'ASIGNATURA' | 'AREA';
export type AccionRegla = 'PROPONE_RETIRO' | 'NO_PROMUEVE' | 'ENVIA_A_COMISION' | 'PENDIENTE_RECUPERACION' | 'NO_RENUEVA_CUPO';
export type AccionSinRegla = 'PENDIENTE_RECUPERACION' | 'NO_PROMUEVE' | 'ENVIA_A_COMISION';
export type ResultadoPromocion =
  | 'PROMOVIDO'
  | 'PENDIENTE_RECUPERACION'
  | 'PROMOVIDO_POR_RECUPERACION'
  | 'PROMOVIDO_CON_ARRASTRE'
  | 'NO_PROMOVIDO'
  | 'EN_COMISION'
  | 'RETIRO_PROPUESTO'
  | 'INCOMPLETO';
export type TipoCondicion =
  | 'PERDIDAS_AL_MENOS'
  | 'PERDIDAS_COMO_MAXIMO'
  | 'PIERDE_ASIGNATURAS'
  | 'PIERDE_AREAS'
  | 'INASISTENCIA_GLOBAL_SUPERA'
  | 'INASISTENCIA_ASIGNATURA_SUPERA'
  | 'PROMEDIO_GENERAL_MENOR'
  | 'SIN_NOTA_AL_MENOS'
  | 'RECUPERACION_NO_SUPERADA_AL_MENOS'
  | 'FALTAS_CONVIVENCIA_AL_MENOS'
  | 'TIENE_PIAR';
export type CondicionArrastre = 'NINGUNA' | 'PLAN_APOYO_PRIMER_PERIODO' | 'NOTA_MINIMA_PRIMER_PERIODO' | 'NOTA_PARA_APROBAR_ANIO_ANTERIOR';
export type ConsecuenciaArrastre = 'SOLO_ALERTA' | 'ENVIA_A_COMISION' | 'PIERDE_PROMOCION';

export const NOMBRES_MOMENTO_PROMOCION: Record<MomentoPromocion, string> = {
  CIERRE: 'Cierre del año (antes de la recuperación final)',
  TRAS_RECUPERACION: 'Tras la recuperación final',
};

export const NOMBRES_RESULTADO: Record<ResultadoPromocion, string> = {
  PROMOVIDO: 'Promovido',
  PENDIENTE_RECUPERACION: 'Pendiente de recuperación',
  PROMOVIDO_POR_RECUPERACION: 'Promovido por recuperación',
  PROMOVIDO_CON_ARRASTRE: 'Promovido con materias pendientes',
  NO_PROMOVIDO: 'No promovido',
  EN_COMISION: 'En comisión',
  RETIRO_PROPUESTO: 'Retiro propuesto',
  INCOMPLETO: 'Notas incompletas',
};

export const NOMBRES_ACCION: Record<AccionRegla, string> = {
  PROPONE_RETIRO: 'Proponer el retiro',
  NO_PROMUEVE: 'No promover',
  ENVIA_A_COMISION: 'Enviar a la comisión',
  PENDIENTE_RECUPERACION: 'Dejar pendiente de recuperación',
  NO_RENUEVA_CUPO: 'No renovar el cupo',
};

export const NOMBRES_CONDICION: Record<TipoCondicion, string> = {
  PERDIDAS_AL_MENOS: 'Reprueba al menos N materias/áreas',
  PERDIDAS_COMO_MAXIMO: 'Reprueba entre 1 y N materias/áreas',
  PIERDE_ASIGNATURAS: 'Reprueba asignaturas específicas',
  PIERDE_AREAS: 'Reprueba áreas específicas',
  INASISTENCIA_GLOBAL_SUPERA: 'Inasistencia global supera X %',
  INASISTENCIA_ASIGNATURA_SUPERA: 'Inasistencia en alguna asignatura supera X %',
  PROMEDIO_GENERAL_MENOR: 'Promedio general del año menor que',
  SIN_NOTA_AL_MENOS: 'Le faltan notas anuales en al menos N',
  RECUPERACION_NO_SUPERADA_AL_MENOS: 'No supera la recuperación final en al menos N',
  FALTAS_CONVIVENCIA_AL_MENOS: 'Faltas de convivencia (al menos N)',
  TIENE_PIAR: 'Tiene un PIAR vigente',
};

export const NOMBRES_CONDICION_ARRASTRE: Record<CondicionArrastre, string> = {
  NINGUNA: 'Ninguna',
  PLAN_APOYO_PRIMER_PERIODO: 'Plan de apoyo en el primer periodo',
  NOTA_MINIMA_PRIMER_PERIODO: 'Nota mínima en el primer periodo',
  NOTA_PARA_APROBAR_ANIO_ANTERIOR: 'Aprobar lo adeudado del año anterior',
};

export const NOMBRES_CONSECUENCIA_ARRASTRE: Record<ConsecuenciaArrastre, string> = {
  SOLO_ALERTA: 'Solo una alerta',
  ENVIA_A_COMISION: 'Enviar a la comisión',
  PIERDE_PROMOCION: 'Pierde la promoción',
};

export interface CondicionRegla {
  tipo: TipoCondicion;
  n?: number | null;
  porcentaje?: number | null;
  nota?: number | null;
  filtro?: 'TODAS' | 'CRITICAS' | 'NO_CRITICAS' | null;
  faltas?: 'SOLO_INJUSTIFICADAS' | 'TODAS' | null;
  modo?: 'ALGUNA' | 'TODAS' | null;
  subject_ids?: string[];
  area_ids?: string[];
  gravedad?: string | null;
}

export interface ReglaPromocion {
  clave: string;
  nombre: string;
  activa: boolean;
  momentos: MomentoPromocion[];
  niveles: string[];
  grados_ids: string[];
  condiciones: CondicionRegla[];
  accion: AccionRegla;
}

export interface PoliticaPromocion {
  unidad: UnidadPromocion;
  area_pierde_con_asignatura_perdida: boolean;
  asignaturas_criticas_ids: string[];
  areas_criticas_ids: string[];
  asignaturas_arrastrables_ids: string[];
  areas_arrastrables_ids: string[];
  reglas: ReglaPromocion[];
  sin_regla: { cierre: AccionSinRegla; tras_recuperacion: AccionSinRegla };
  arrastre: { admite: boolean; max_unidades: number; condicion: CondicionArrastre; nota_minima: number | null; hasta_periodo: number; si_incumple: ConsecuenciaArrastre };
  piar: { derivar_a_comision: boolean };
  titulacion: {
    grado_titulacion: number;
    servicio_social: { activo: boolean; horas_requeridas: number; alerta_desde_grado: number };
    saber_11: { activo: boolean };
    paz_y_salvo: { activo: boolean };
    carpeta_academica: { activo: boolean; desde_grado: number };
  };
  texto_siee: string;
}

export interface UnidadPerdida {
  tipo: UnidadPromocion;
  id: string;
  nombre: string;
  nota: number | null;
  critica: boolean;
  arrastrable: boolean;
}

export interface ResultadoMotor {
  resultado: ResultadoPromocion;
  momento: MomentoPromocion;
  perdidas: UnidadPerdida[];
  a_recuperar: UnidadPerdida[];
  arrastres: UnidadPerdida[];
  sin_nota: string[];
  reglas_disparadas: Array<{ clave: string; nombre: string; accion: AccionRegla }>;
  no_renueva_cupo: boolean;
  motivos: string[];
}

export interface FilaPromocion {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  cerrado: { version: number; momento: MomentoPromocion; resultado: ResultadoPromocion } | null;
  motor: ResultadoMotor | null;
}

export interface ResumenCierre {
  momento: MomentoPromocion;
  cerrados: number;
  omitidos: number;
  por_resultado: Partial<Record<ResultadoPromocion, number>>;
  bloqueados: Array<{ student_id: string; nivelaciones_pendientes: string[] }>;
}

// --- Rollover ---

export type DestinoRollover = 'GRADO_SIGUIENTE' | 'MISMO_GRADO' | 'TERMINA_CICLO' | 'NO_RENUEVA_CUPO' | 'SIN_DECISION';
export type EstadoFilaRollover = 'POR_CREAR' | 'YA_TIENE_MATRICULA' | 'SIN_CUPO' | 'NO_APLICA';

export const NOMBRES_DESTINO: Record<DestinoRollover, string> = {
  GRADO_SIGUIENTE: 'Grado siguiente',
  MISMO_GRADO: 'Repite el grado',
  TERMINA_CICLO: 'Termina el ciclo',
  NO_RENUEVA_CUPO: 'No se renueva el cupo',
  SIN_DECISION: 'Sin decisión',
};

export const NOMBRES_ESTADO_ROLLOVER: Record<EstadoFilaRollover, string> = {
  POR_CREAR: 'Se pre-matriculará',
  YA_TIENE_MATRICULA: 'Ya tiene matrícula',
  SIN_CUPO: 'Sin cupo',
  NO_APLICA: 'No aplica',
};

export interface FilaRollover {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  grupo_origen: string;
  resultado: ResultadoPromocion | null;
  destino: DestinoRollover;
  estado: EstadoFilaRollover;
  motivo: string;
  tipo_ingreso: 'ANTIGUO' | 'REPITENTE' | null;
  grupo_destino_id: string | null;
  grupo_destino: string | null;
  paz_y_salvo: 'CONFIRMADO' | 'PENDIENTE';
}

export interface PlanRollover {
  origen: { id: string; year: number };
  destino: { id: string; year: number };
  filas: FilaRollover[];
  retirados: number;
  resumen: { total: number; por_crear: number; ya_tienen_matricula: number; sin_cupo: number; no_aplica: number; por_destino: Partial<Record<DestinoRollover, number>> };
}

export interface ResultadoRollover {
  creadas: number;
  fallidas: Array<{ student_id: string; estudiante: string; error: string }>;
  plan: PlanRollover['resumen'];
}

// --- Hooks ---

export function usePoliticaPromocion(academicYearId?: string) {
  return useQuery({
    queryKey: ['promocion', 'politica', academicYearId ?? null],
    queryFn: () => api.get<PoliticaPromocion>(`/promocion/politica/${academicYearId}`),
    enabled: Boolean(academicYearId),
  });
}

export function useActualizarPoliticaPromocion(academicYearId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (politica: PoliticaPromocion) => api.put<PoliticaPromocion>(`/promocion/politica/${academicYearId}`, politica),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promocion'] });
    },
  });
}

export function useSimulacionPromocion(academicYearId: string | undefined, groupId: string | undefined, momento: MomentoPromocion) {
  return useQuery({
    queryKey: ['promocion', 'simulacion', academicYearId, groupId, momento],
    queryFn: () => api.get<FilaPromocion[]>('/promocion/simulacion', { academic_year_id: academicYearId, group_id: groupId, momento }),
    enabled: Boolean(academicYearId && groupId),
  });
}

export function useCerrarGrupoPromocion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { academic_year_id: string; group_id: string; momento: MomentoPromocion; confirm_password: string }) => api.post<ResumenCierre>('/promocion/cierre', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promocion'] });
      void queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
  });
}

export function useSimulacionRollover(origenId: string | undefined, destinoId: string | undefined, sedeId?: string) {
  return useQuery({
    queryKey: ['promocion', 'rollover', origenId, destinoId, sedeId ?? null],
    queryFn: () => api.get<PlanRollover>('/promocion/rollover', { origen_id: origenId, destino_id: destinoId, sede_id: sedeId }),
    enabled: Boolean(origenId && destinoId),
    retry: false,
  });
}

export function useEjecutarRollover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { origen_id: string; destino_id: string; sede_id?: string; confirm_password: string }) => api.post<ResultadoRollover>('/promocion/rollover', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promocion', 'rollover'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
