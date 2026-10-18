import { FaltasComputables } from '../constants/promocion';
import { FirmasRequeridas, Mayoria, NivelRiesgo, Voto } from '../constants/comision';
import { calcularQuorum, Quorum } from './comiteConvivencia';

/** Lo que el colegio decide para el tablero y las sesiones de M20. Nada de esto está quemado en el código. */
export interface ConfiguracionDeComision {
  semaforo: {
    /** Desde cuántas asignaturas perdidas cada nivel (ej. 1, 2 y 3). */
    amarillo_desde: number;
    naranja_desde: number;
    rojo_desde: number;
    /** Por encima de este % de inasistencia el estudiante queda en rojo sin importar sus notas. */
    inasistencia_roja_pct: number;
    faltas: FaltasComputables;
  };
  reprobacion_masiva: {
    /** % del grupo reprobado a partir del cual se alerta (se alerta si lo supera). */
    porcentaje: number;
    /** Con menos estudiantes evaluados no se alerta: en un grupo de 5, un solo reprobado ya es 20%. */
    minimo_estudiantes: number;
  };
  quorum_porcentaje: number;
  mayoria: Mayoria;
  firmas_requeridas: FirmasRequeridas;
}

export const CONFIGURACION_INICIAL: ConfiguracionDeComision = {
  semaforo: { amarillo_desde: 1, naranja_desde: 2, rojo_desde: 3, inasistencia_roja_pct: 20, faltas: 'SOLO_INJUSTIFICADAS' },
  reprobacion_masiva: { porcentaje: 25, minimo_estudiantes: 8 },
  quorum_porcentaje: 51,
  mayoria: 'SIMPLE',
  firmas_requeridas: 'TODOS_LOS_ASISTENTES',
};

export function validarConfiguracion(c: ConfiguracionDeComision): string | null {
  const s = c.semaforo;
  if (!(s.amarillo_desde >= 1 && s.amarillo_desde < s.naranja_desde && s.naranja_desde < s.rojo_desde)) {
    return 'Los umbrales del semáforo deben crecer: amarillo desde 1 o más, naranja mayor que amarillo y rojo mayor que naranja.';
  }
  if (s.inasistencia_roja_pct <= 0 || s.inasistencia_roja_pct > 100) return 'El porcentaje de inasistencia para rojo debe estar entre 1 y 100.';
  if (c.reprobacion_masiva.porcentaje <= 0 || c.reprobacion_masiva.porcentaje > 100) return 'El porcentaje de reprobación masiva debe estar entre 1 y 100.';
  if (c.reprobacion_masiva.minimo_estudiantes < 1) return 'El mínimo de estudiantes para alertar debe ser al menos 1.';
  if (c.quorum_porcentaje < 1 || c.quorum_porcentaje > 100) return 'El quórum debe estar entre 1 y 100.';
  return null;
}

// --- Semáforo de riesgo ---

export interface RiesgoDeEstudiante {
  nivel: NivelRiesgo;
  motivos: string[];
}

/**
 * Nivel de riesgo de un estudiante. Por asignaturas perdidas según los umbrales del colegio; si su inasistencia supera el tope queda en
 * ROJO aunque no pierda nada (proyección directa de no promoción). Es una ayuda para convocar a tiempo: no decide la promoción (eso es M19).
 */
export function nivelDeRiesgo(perdidas: number, inasistenciaPct: number, c: ConfiguracionDeComision['semaforo']): RiesgoDeEstudiante {
  const motivos: string[] = [];
  let nivel: NivelRiesgo = 'VERDE';
  if (perdidas >= c.rojo_desde) nivel = 'ROJO';
  else if (perdidas >= c.naranja_desde) nivel = 'NARANJA';
  else if (perdidas >= c.amarillo_desde) nivel = 'AMARILLO';
  if (perdidas > 0) motivos.push(`${perdidas} asignatura(s) perdida(s)`);
  if (inasistenciaPct > c.inasistencia_roja_pct) {
    nivel = 'ROJO';
    motivos.push(`Inasistencia de ${inasistenciaPct}% (el tope es ${c.inasistencia_roja_pct}%)`);
  }
  return { nivel, motivos };
}

export interface ConteoDeReprobacion {
  clave: string;
  nombre: string;
  evaluados: number;
  reprobados: number;
}

export interface AlertaMasiva extends ConteoDeReprobacion {
  porcentaje: number;
}

/** Las asignaturas, grupos o docentes cuya tasa de reprobación supera el tope del colegio (con un mínimo de evaluados para no alertar por ruido). */
export function alertasDeReprobacionMasiva(conteos: readonly ConteoDeReprobacion[], c: ConfiguracionDeComision['reprobacion_masiva']): AlertaMasiva[] {
  return conteos
    .filter((k) => k.evaluados >= c.minimo_estudiantes)
    .map((k) => ({ ...k, porcentaje: Math.round((k.reprobados / k.evaluados) * 1000) / 10 }))
    .filter((k) => k.porcentaje > c.porcentaje)
    .sort((a, b) => b.porcentaje - a.porcentaje);
}

// --- Votación y firmas ---

export interface ResultadoVotacion {
  a_favor: number;
  en_contra: number;
  abstenciones: number;
  /** Quienes podían votar el caso (presentes y no recusados). */
  habilitados: number;
  aprobada: boolean;
}

/**
 * Cuenta los votos de un caso. Solo cuentan quienes asistieron y no están recusados. SIMPLE: más a favor que en contra; ABSOLUTA: más de la mitad
 * de los habilitados a favor. Una abstención no suma a ningún lado. Sin votos no hay decisión aprobada.
 */
export function contarVotos(votos: ReadonlyArray<{ miembro_id: string; voto: Voto }>, habilitados: readonly string[], mayoria: Mayoria): ResultadoVotacion {
  const pueden = new Set(habilitados);
  const validos = votos.filter((v) => pueden.has(v.miembro_id));
  const a_favor = validos.filter((v) => v.voto === 'A_FAVOR').length;
  const en_contra = validos.filter((v) => v.voto === 'EN_CONTRA').length;
  const abstenciones = validos.filter((v) => v.voto === 'ABSTENCION').length;
  const aprobada = mayoria === 'ABSOLUTA' ? a_favor * 2 > pueden.size && a_favor > 0 : a_favor > en_contra;
  return { a_favor, en_contra, abstenciones, habilitados: pueden.size, aprobada };
}

export interface MiembroParaFirma {
  miembro_id: string;
  asistio: boolean;
  es_presidente: boolean;
  /** Solo quien tiene usuario puede firmar con su contraseña; los externos (personero, padres) firman en papel. */
  tiene_usuario: boolean;
  firmo: boolean;
}

/** Quiénes deben firmar con el sistema para que el acta quede firmada, según la configuración. */
export function firmantesRequeridos(miembros: readonly MiembroParaFirma[], requeridas: FirmasRequeridas): string[] {
  const presentes = miembros.filter((m) => m.asistio && m.tiene_usuario);
  return (requeridas === 'SOLO_PRESIDENTE' ? presentes.filter((m) => m.es_presidente) : presentes).map((m) => m.miembro_id);
}

export function actaCompleta(miembros: readonly MiembroParaFirma[], requeridas: FirmasRequeridas): boolean {
  const requeridos = firmantesRequeridos(miembros, requeridas);
  const firmaron = new Set(miembros.filter((m) => m.firmo).map((m) => m.miembro_id));
  return requeridos.length > 0 && requeridos.every((id) => firmaron.has(id));
}

export function quorumDeSesion(miembros: readonly { asistio: boolean }[], porcentaje: number): Quorum {
  return calcularQuorum(miembros.length, miembros.filter((m) => m.asistio).length, porcentaje);
}
