import { EstadoTitulacion, NOMBRES_REQUISITO, RequisitoTitulacion } from '../constants/titulacion';
import { PoliticaTitulacion } from './promocion';

export interface EntradaTitulacion {
  /** Número del grado que cursa o cursó (11 = último). */
  grado_numero: number;
  horas_servicio_social: number;
  presento_saber_11: boolean;
  paz_y_salvo_confirmado: boolean;
  /** Números de los grados anteriores de los que no hay certificado (ni propio aprobado ni externo recibido). */
  grados_sin_certificado: number[];
}

export interface RequisitoPendiente {
  requisito: RequisitoTitulacion;
  /** Frase para mostrar a Secretaría y a la familia: «Debe 40 horas de servicio social». */
  detalle: string;
}

export interface EvaluacionRequisitos {
  pendientes: RequisitoPendiente[];
  /** Avisos que no bloquean: p. ej. servicio social en 10°. */
  alertas: RequisitoPendiente[];
}

const horasFaltantes = (requeridas: number, cumplidas: number): number => Math.max(0, Math.round((requeridas - cumplidas) * 100) / 100);

/**
 * Qué le falta a un estudiante para titularse. Solo en el grado de titulación los requisitos bloquean; antes de él, el servicio social
 * solo avisa desde `alerta_desde_grado` (así 10° ve cuánto debe sin que eso impida promoverlo).
 */
export function evaluarRequisitos(e: EntradaTitulacion, p: PoliticaTitulacion): EvaluacionRequisitos {
  const pendientes: RequisitoPendiente[] = [];
  const alertas: RequisitoPendiente[] = [];
  const bloquea = e.grado_numero >= p.grado_titulacion;
  const faltanHoras = horasFaltantes(p.servicio_social.horas_requeridas, e.horas_servicio_social);

  if (p.servicio_social.activo && faltanHoras > 0) {
    const detalle = `Debe ${faltanHoras} horas de servicio social (lleva ${e.horas_servicio_social} de ${p.servicio_social.horas_requeridas}).`;
    if (bloquea) pendientes.push({ requisito: 'SERVICIO_SOCIAL', detalle });
    else if (e.grado_numero >= p.servicio_social.alerta_desde_grado) alertas.push({ requisito: 'SERVICIO_SOCIAL', detalle });
  }
  if (!bloquea) return { pendientes, alertas };

  if (p.saber_11.activo && !e.presento_saber_11) pendientes.push({ requisito: 'SABER_11', detalle: 'No registra la presentación de las pruebas Saber 11.' });
  if (p.paz_y_salvo.activo && !e.paz_y_salvo_confirmado) pendientes.push({ requisito: 'PAZ_Y_SALVO', detalle: 'El paz y salvo institucional no está confirmado.' });
  if (p.carpeta_academica.activo && e.grados_sin_certificado.length > 0) {
    pendientes.push({ requisito: 'CARPETA_ACADEMICA', detalle: `Falta el certificado de los grados: ${e.grados_sin_certificado.join(', ')}.` });
  }
  return { pendientes, alertas };
}

/** Los grados anteriores al de titulación (desde el que la política indica) que no tienen certificado. */
export function gradosSinCertificado(p: PoliticaTitulacion, conCertificado: ReadonlySet<number>): number[] {
  const faltantes: number[] = [];
  for (let n = p.carpeta_academica.desde_grado; n < p.grado_titulacion; n += 1) if (!conCertificado.has(n)) faltantes.push(n);
  return faltantes;
}

/**
 * Situación de titulación a partir de lo que falta. Null = no aplica (no aprobó el grado). Quien cumplía todo desde el principio queda
 * GRADUADO; quien estaba APROBO_NO_GRADUADO y cumple después queda GRADUADO_EXTEMPORANEO (grado por ventanilla); lo ya graduado no retrocede.
 */
export function estadoDeTitulacion(aprobo: boolean, pendientes: readonly RequisitoPendiente[], anterior: EstadoTitulacion | null): EstadoTitulacion | null {
  if (!aprobo) return null;
  if (anterior === 'GRADUADO' || anterior === 'GRADUADO_EXTEMPORANEO') return anterior;
  if (pendientes.length > 0) return 'APROBO_NO_GRADUADO';
  return anterior === 'APROBO_NO_GRADUADO' ? 'GRADUADO_EXTEMPORANEO' : 'GRADUADO';
}

export const nombreDeRequisito = (r: RequisitoTitulacion): string => NOMBRES_REQUISITO[r];
