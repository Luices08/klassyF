import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /comision) ---

export type InstanciaSesion = 'COMISION_EVALUACION' | 'CONSEJO_ACADEMICO' | 'CONSEJO_DIRECTIVO';
export type EstadoSesion = 'BORRADOR' | 'CONVOCADA' | 'REALIZADA' | 'FIRMADA' | 'ANULADA';
export type TipoCaso = 'SEGUIMIENTO' | 'PROMOCION' | 'PROMOCION_ANTICIPADA';
export type DecisionCaso =
  | 'PROMOVER'
  | 'NO_PROMOVER'
  | 'PROMOVER_CON_ARRASTRE'
  | 'ENVIAR_A_RECUPERACION'
  | 'RECOMENDAR_ANTICIPADA'
  | 'NO_RECOMENDAR_ANTICIPADA'
  | 'APROBAR_ANTICIPADA'
  | 'NO_APROBAR_ANTICIPADA';
export type Voto = 'A_FAVOR' | 'EN_CONTRA' | 'ABSTENCION';
export type NivelRiesgo = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO';
export type Representacion = 'DIRECTIVO' | 'DOCENTE' | 'ORIENTACION' | 'PADRES' | 'ESTUDIANTES' | 'OTRO';
export type ResponsableCompromiso = 'ACUDIENTE' | 'ESTUDIANTE' | 'DOCENTE' | 'INSTITUCION';
export type EstadoCompromiso = 'PENDIENTE' | 'CUMPLIDO' | 'INCUMPLIDO';

export const NOMBRES_INSTANCIA: Record<InstanciaSesion, string> = {
  COMISION_EVALUACION: 'Comisión de Evaluación y Promoción',
  CONSEJO_ACADEMICO: 'Consejo Académico',
  CONSEJO_DIRECTIVO: 'Consejo Directivo',
};
export const NOMBRES_ESTADO_SESION: Record<EstadoSesion, string> = { BORRADOR: 'Borrador', CONVOCADA: 'Convocada', REALIZADA: 'Realizada', FIRMADA: 'Firmada', ANULADA: 'Anulada' };
export const NOMBRES_TIPO_CASO: Record<TipoCaso, string> = { SEGUIMIENTO: 'Seguimiento', PROMOCION: 'Promoción del año', PROMOCION_ANTICIPADA: 'Promoción anticipada' };
export const NOMBRES_DECISION: Record<DecisionCaso, string> = {
  PROMOVER: 'Promover al grado siguiente',
  NO_PROMOVER: 'No promover',
  PROMOVER_CON_ARRASTRE: 'Promover con asignatura(s) pendiente(s)',
  ENVIAR_A_RECUPERACION: 'Enviar a recuperación',
  RECOMENDAR_ANTICIPADA: 'Recomendar la promoción anticipada',
  NO_RECOMENDAR_ANTICIPADA: 'No recomendar la promoción anticipada',
  APROBAR_ANTICIPADA: 'Aprobar la promoción anticipada',
  NO_APROBAR_ANTICIPADA: 'No aprobar la promoción anticipada',
};
export const NOMBRES_VOTO: Record<Voto, string> = { A_FAVOR: 'A favor', EN_CONTRA: 'En contra', ABSTENCION: 'Abstención' };
export const NOMBRES_REPRESENTACION: Record<Representacion, string> = { DIRECTIVO: 'Directivo', DOCENTE: 'Docente', ORIENTACION: 'Orientación', PADRES: 'Padres de familia', ESTUDIANTES: 'Estudiantes', OTRO: 'Otro' };
export const NOMBRES_RESPONSABLE: Record<ResponsableCompromiso, string> = { ACUDIENTE: 'Acudiente', ESTUDIANTE: 'Estudiante', DOCENTE: 'Docente', INSTITUCION: 'Institución' };

/** Qué decisiones puede tomar cada instancia sobre cada tipo de caso (espejo de lo que valida el servidor). */
export function decisionesDe(tipo: TipoCaso, instancia: InstanciaSesion): DecisionCaso[] {
  if (tipo === 'PROMOCION') return ['PROMOVER', 'NO_PROMOVER', 'PROMOVER_CON_ARRASTRE', 'ENVIAR_A_RECUPERACION'];
  if (tipo === 'PROMOCION_ANTICIPADA') return instancia === 'COMISION_EVALUACION' ? ['RECOMENDAR_ANTICIPADA', 'NO_RECOMENDAR_ANTICIPADA'] : instancia === 'CONSEJO_DIRECTIVO' ? ['APROBAR_ANTICIPADA', 'NO_APROBAR_ANTICIPADA'] : [];
  return [];
}

export interface ConfiguracionComision {
  semaforo: { amarillo_desde: number; naranja_desde: number; rojo_desde: number; inasistencia_roja_pct: number; faltas: 'SOLO_INJUSTIFICADAS' | 'TODAS' };
  reprobacion_masiva: { porcentaje: number; minimo_estudiantes: number };
  quorum_porcentaje: number;
  mayoria: 'SIMPLE' | 'ABSOLUTA';
  firmas_requeridas: 'TODOS_LOS_ASISTENTES' | 'SOLO_PRESIDENTE';
}

export interface EstudianteEnRiesgo {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string;
  grupo_id: string;
  perdidas: string[];
  asignaturas_sin_nota: number;
  inasistencia_pct: number;
  nivel: NivelRiesgo;
  motivos: string[];
  tiene_piar: boolean;
}

export interface AlertaMasiva {
  clave: string;
  nombre: string;
  evaluados: number;
  reprobados: number;
  porcentaje: number;
}

export interface TableroDeRiesgo {
  periodo_numero: number;
  hay_notas_provisionales: boolean;
  resumen: Record<NivelRiesgo, number> & { total: number; con_piar: number };
  estudiantes: EstudianteEnRiesgo[];
  alertas_masivas: { asignaturas: AlertaMasiva[]; docentes: AlertaMasiva[] };
}

export interface MiembroSesion {
  _id: string;
  user_id: string | null;
  nombre: string;
  cargo: string;
  representa: Representacion;
  es_presidente: boolean;
  asistio: boolean;
  firma: { fecha: string } | null;
}

export interface CasoSesion {
  _id: string;
  student_id: string;
  enrollment_id: string;
  tipo: TipoCaso;
  evaluacion_id: string | null;
  anticipada_id: string | null;
  recusados_ids: string[];
  deliberacion: string;
  votos: Array<{ miembro_id: string; voto: Voto }>;
  decision: { tipo: DecisionCaso; fundamento: string } | null;
  resultado_votacion: { a_favor: number; en_contra: number; abstenciones: number; habilitados: number; aprobada: boolean; quorum: boolean } | null;
}

export interface CompromisoSesion {
  _id: string;
  caso_id: string | null;
  student_id: string;
  responsable_tipo: ResponsableCompromiso;
  responsable_nombre: string;
  descripcion: string;
  fecha_limite: string;
  estado: EstadoCompromiso;
  seguimientos: Array<{ fecha: string; texto: string }>;
}

export interface SesionResumen {
  _id: string;
  instancia: InstanciaSesion;
  anio: number;
  alcance: { periodo_numero: number | null; grados_ids: string[] };
  estado: EstadoSesion;
  fecha: string;
  hora: string;
  lugar: string;
  codigo: string | null;
  miembros: Array<{ _id: string; nombre: string; cargo: string }>;
}

export interface Sesion extends Omit<SesionResumen, 'miembros'> {
  academic_year_id: string;
  orden_del_dia: string;
  miembros: MiembroSesion[];
  casos: CasoSesion[];
  compromisos: CompromisoSesion[];
  desarrollo: string;
  conclusiones: string;
  quorum: { total_miembros: number; presentes: number; porcentaje_requerido: number; alcanzado: boolean } | null;
  hash: string | null;
  firmada_at: string | null;
  anulacion: { motivo: string } | null;
  updatedAt?: string;
  /** Nombres de los estudiantes de los casos y compromisos, por id. */
  estudiantes: Record<string, { nombre: string; apellido: string; numero_documento: string }>;
}

export interface FichaEstudiante {
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  grupo: string;
  grado: string;
  notas_por_periodo: Array<{ asignatura: string; periodos: Array<{ periodo: number; nota: number | null; estado: string }> }>;
  recuperaciones: Array<{ asignatura: string; tipo: string; periodo: number; nota_original: number; nota_resultante: number | null; estado: string; intentos: number }>;
  inasistencias: {
    por_periodo: Array<{ periodo: number; total: number; justificadas: number; injustificadas: number }>;
    total: { total: number; justificadas: number; injustificadas: number };
  };
  convivencia: { observaciones: number; faltas: Record<string, number>; nota: string };
  orientacion: { tiene_remisiones: boolean };
  tiene_piar: boolean;
  cierre_promocion: { resultado: string; version: number; momento: string } | null;
  compromisos_previos: Array<{ sesion: string; descripcion: string; responsable: string; fecha_limite: string; estado: string }>;
}

export interface EntradaMiembro {
  user_id?: string | null;
  nombre?: string;
  cargo: string;
  representa?: Representacion;
  es_presidente?: boolean;
}

// --- Lecturas ---

export function useConfiguracionComision() {
  return useQuery({ queryKey: ['comision', 'configuracion'], queryFn: () => api.get<ConfiguracionComision>('/comision/configuracion') });
}

export function useTableroRiesgo(filtros: { academic_year_id?: string; periodo_numero?: number; group_id?: string }) {
  return useQuery({
    queryKey: ['comision', 'tablero', filtros],
    queryFn: () => api.get<TableroDeRiesgo>('/comision/tablero', { ...filtros }),
    enabled: Boolean(filtros.academic_year_id && filtros.periodo_numero),
  });
}

export function useFichaEstudiante(studentId: string | undefined, anioId: string | undefined) {
  return useQuery({
    queryKey: ['comision', 'ficha', studentId, anioId],
    queryFn: () => api.get<FichaEstudiante>(`/comision/estudiantes/${studentId}/ficha`, { academic_year_id: anioId }),
    enabled: Boolean(studentId && anioId),
  });
}

export function useSesiones(filtros: { academic_year_id?: string; instancia?: InstanciaSesion; estado?: EstadoSesion }) {
  return useQuery({
    queryKey: ['comision', 'sesiones', filtros],
    queryFn: () => api.get<SesionResumen[]>('/comision/sesiones', { ...filtros }),
    enabled: Boolean(filtros.academic_year_id),
  });
}

export function useSesion(id: string | undefined) {
  return useQuery({ queryKey: ['comision', 'sesion', id], queryFn: () => api.get<Sesion>(`/comision/sesiones/${id}`), enabled: Boolean(id) });
}

export const descargarActaSesion = (id: string) => api.downloadBlob(`/comision/sesiones/${id}/pdf`);

// --- Escrituras (todas refrescan el prefijo 'comision' y, si tocan promoción, lo que la lee) ---

function useMutacion<T, R = unknown>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['comision'] });
      void queryClient.invalidateQueries({ queryKey: ['promocion'] });
      void queryClient.invalidateQueries({ queryKey: ['promocion-anticipada'] });
    },
  });
}

export const useActualizarConfiguracionComision = () => useMutacion((c: ConfiguracionComision) => api.put<ConfiguracionComision>('/comision/configuracion', c));

export const useCrearSesion = () =>
  useMutacion((input: { instancia: InstanciaSesion; academic_year_id: string; periodo_numero?: number | null; grados_ids?: string[]; fecha: string; hora?: string; lugar?: string; orden_del_dia?: string; miembros: EntradaMiembro[] }) =>
    api.post<Sesion>('/comision/sesiones', input)
  );

export const useActualizarSesion = () =>
  useMutacion((input: { id: string; cambios: Partial<{ fecha: string; hora: string; lugar: string; orden_del_dia: string; desarrollo: string; conclusiones: string; miembros: EntradaMiembro[]; asistencia: Array<{ miembro_id: string; asistio: boolean }> }> }) =>
    api.patch<Sesion>(`/comision/sesiones/${input.id}`, input.cambios)
  );

export const useConvocarSesion = () => useMutacion((id: string) => api.post<Sesion>(`/comision/sesiones/${id}/convocar`));
export const useRealizarSesion = () => useMutacion((id: string) => api.post<Sesion>(`/comision/sesiones/${id}/realizar`));
export const useFirmarSesion = () => useMutacion((input: { id: string; confirm_password: string }) => api.post<Sesion>(`/comision/sesiones/${input.id}/firmar`, { confirm_password: input.confirm_password }));
export const useAnularSesion = () => useMutacion((input: { id: string; motivo: string }) => api.post<Sesion>(`/comision/sesiones/${input.id}/anular`, { motivo: input.motivo }));

export const useAgregarCaso = () =>
  useMutacion((input: { sesionId: string; student_id: string; tipo: TipoCaso; promocion_anticipada_id?: string }) => {
    const { sesionId, ...cuerpo } = input;
    return api.post<Sesion>(`/comision/sesiones/${sesionId}/casos`, cuerpo);
  });

export const useActualizarCaso = () =>
  useMutacion((input: { sesionId: string; casoId: string; cambios: Partial<{ deliberacion: string; recusados_ids: string[]; votos: Array<{ miembro_id: string; voto: Voto }>; decision: { tipo: DecisionCaso; fundamento?: string } | null }> }) =>
    api.patch<Sesion>(`/comision/sesiones/${input.sesionId}/casos/${input.casoId}`, input.cambios)
  );

export const useQuitarCaso = () => useMutacion((input: { sesionId: string; casoId: string }) => api.delete<Sesion>(`/comision/sesiones/${input.sesionId}/casos/${input.casoId}`));

export const useAgregarCompromiso = () =>
  useMutacion((input: { sesionId: string; student_id: string; caso_id?: string | null; responsable_tipo: ResponsableCompromiso; responsable_nombre: string; descripcion: string; fecha_limite: string }) => {
    const { sesionId, ...cuerpo } = input;
    return api.post<Sesion>(`/comision/sesiones/${sesionId}/compromisos`, cuerpo);
  });

export const useActualizarCompromiso = () =>
  useMutacion((input: { sesionId: string; compromisoId: string; estado?: EstadoCompromiso; seguimiento?: string }) => {
    const { sesionId, compromisoId, ...cuerpo } = input;
    return api.patch<Sesion>(`/comision/sesiones/${sesionId}/compromisos/${compromisoId}`, cuerpo);
  });
