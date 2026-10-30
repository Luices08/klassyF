import { ACCIONES_AUDITORIA, AccionAuditoria } from '../models/auditLog.model';

/**
 * M31: el historial de acciones solo muestra lo que cambia los componentes del sistema: crear, editar, matricular y eliminar.
 * La bitácora sigue guardando TODO (también lecturas, descargas, inicios de sesión: la ley exige auditar quién consulta datos de
 * menores y varios servicios leen la bitácora para no repetir avisos); el filtro está solo en lo que se lee y se exporta.
 * Cada acción se clasifica por su código, así no hay que tocar ningún registro viejo; una acción nueva sin clasificar
 * hace fallar la prueba `historialAcciones.test.ts`, que obliga a decidir si entra al historial.
 */
export const TIPOS_EVENTO = [
  { clave: 'CREACION', nombre: 'Creación' },
  { clave: 'EDICION', nombre: 'Edición' },
  { clave: 'MATRICULACION', nombre: 'Matriculación' },
  { clave: 'ELIMINACION', nombre: 'Eliminación' },
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number]['clave'];

export const nombreDeTipoEvento = (tipo: TipoEvento | null): string => TIPOS_EVENTO.find((t) => t.clave === tipo)?.nombre ?? '';

/**
 * Lo que NO es crear, editar, matricular ni eliminar: consultar, descargar, previsualizar, exportar, generar un PDF o un reporte,
 * entrar o salir del sistema, o un intento que no cambió nada (rechazado, bloqueado).
 */
const FUERA_DEL_HISTORIAL: RegExp[] = [
  /CONSULTAD[OA]S?/,
  /DESCARGAD[OA]/,
  /VISTA_PREVIA/,
  /EXPORTAD[OA]/,
  /PDF_GENERADO/,
  /INFORME_GENERADO/,
  /^REPORTE_CIERRE_GENERADO$/,
  /^SALIDA_BOLETIN_PARCIAL_GENERADO$/,
  /^LOGIN_/,
  /^PERFIL_CAMBIADO$/,
  /^SESIONES_CERRADAS$/,
  /^PASSWORD_/,
  /^USUARIO_ELIMINACION_BLOQUEADA$/,
  /^NOTAS_EXCEL_RECHAZADO$/,
  /^GRUPO_EXCEDE_AFORO_AULA$/,
  /^CITACION_CORREO_REENVIADO$/,
  /^PREDICTIVO_/,
  // Simular un archivo de SIMAT o descartar la simulación no escribe ningún estudiante ni matrícula: solo la aplicación lo hace.
  /^IMPORTACION_SIMAT_(SIMULADA|DESCARTADA)$/,
];

const MATRICULACION: RegExp[] = [
  /^MATRICULA_/,
  /^ADMISION_/,
  /^INSCRIPCION_/,
  /^PREMATRICULA_/,
  /^REMATRICULA_/,
  /^CUPO_/,
  /^SOLICITUD_EN_ESPERA$/,
  /^CONTINUIDAD_REGISTRADA$/,
  /^SALIDA_MATRICULA_REGISTRADA$/,
  /^SALIDA_CUPO_LIBERADO$/,
  /^TRASLADO_REGISTRADO$/,
  /^PROMOCION_ROLLOVER_EJECUTADO$/,
  /^IMPORTACION_SIMAT_(APLICADA|REINGRESO)$/,
];

// «Anular» no entra aquí a propósito: en Klassy anular deja el registro marcado y eliminar lo borra, y son cosas distintas.
const ELIMINACION = /(ELIMINAD[OA]S?|QUITAD[OA]|DESVINCULAD[OA]|RETIRAD[OA]|DEPURAD[OA]S?)$/;

const EDICION =
  /(ACTUALIZAD[OA]S?|EDITAD[OA]|ENMENDAD[OA]|CAMBIAD[OA]|CONFIGURAD[OA]|MODIFICAD[OA]|REABIERT[OA]|CERRAD[OA]S?|ANULAD[OA]|REVISAD[OA]|APROBAD[OA]|RECHAZAD[OA]|ACTIVAD[OA]|ARCHIVAD[OA]|FIRMAD[OA]|REEMPLAZAD[OA]|ELEGIDA|GUARDAD[OA]S?|SINCRONIZAD[OA]S?|DESCARTAD[OA]|REVOCAD[OA]|BLOQUEAD[OA]|EXCEPCION|VERIFICAD[OA]|DEFINITIVAS|REEVALUADA|APLICADA|ATENDIDA|RESUELTA|REALIZADA|CONVOCADA|CANCELADA|IMPEDIMENTO|PUBLICAD[OA]|HABILITAD[OA]|RESPUESTA|RECLASIFICAD[OA]|ANULACION_MASIVA|_ESTADO$|_CIERRE_GRUPO$)/;

// Cambiar cómo funciona la matrícula (reglas, cupos de la rematrícula) es editar una configuración, no matricular a nadie.
const CONFIGURACION = /(CONFIGURAD[OA]|CONFIGURACION)/;

const CREACION =
  /(CREAD[OA]|REGISTRAD[OA]|ASIGNAD[OA]|VINCULAD[OA]|EMITID[OA]|EXPEDID[OA]|RADICAD[OA]|OTORGAD[OA]|AGREGAD[OA]|ABIERTO|SOLICITAD[OA]|GENERAD[OA]|IMPORTAD[OA]S?|ADOPTAD[OA]|CARGAD[OA]|ANEXO|^IMPORTACION_CONVIVENCIA$)/;

export const esAccionFueraDelHistorial = (accion: string): boolean => FUERA_DEL_HISTORIAL.some((r) => r.test(accion));

/** `null` = la acción no es de crear, editar, matricular ni eliminar y no sale en el historial. */
export function tipoDeAccion(accion: string): TipoEvento | null {
  if (esAccionFueraDelHistorial(accion)) return null;
  if (CONFIGURACION.test(accion)) return 'EDICION';
  if (MATRICULACION.some((r) => r.test(accion))) return 'MATRICULACION';
  if (ELIMINACION.test(accion)) return 'ELIMINACION';
  if (EDICION.test(accion)) return 'EDICION';
  if (CREACION.test(accion)) return 'CREACION';
  return null;
}

/** Acciones que sí entran al historial, por tipo. Se calcula una vez: el catálogo de acciones es una constante. */
const ACCIONES_POR_TIPO = new Map<TipoEvento, AccionAuditoria[]>(TIPOS_EVENTO.map((t) => [t.clave, []]));
for (const accion of ACCIONES_AUDITORIA) {
  const tipo = tipoDeAccion(accion);
  if (tipo) ACCIONES_POR_TIPO.get(tipo)!.push(accion);
}

export const accionesDeTipo = (tipo: TipoEvento): AccionAuditoria[] => ACCIONES_POR_TIPO.get(tipo) ?? [];

/** Todas las acciones que el historial muestra y exporta. */
export const ACCIONES_DEL_HISTORIAL: AccionAuditoria[] = TIPOS_EVENTO.flatMap((t) => accionesDeTipo(t.clave));

/** Acciones que la bitácora guarda pero el historial no muestra: la prueba las lista para que cada una sea una decisión explícita. */
export const ACCIONES_FUERA_DEL_HISTORIAL: AccionAuditoria[] = ACCIONES_AUDITORIA.filter((a) => tipoDeAccion(a) === null);
