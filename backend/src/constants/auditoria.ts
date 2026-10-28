import { ACCIONES_AUDITORIA, AccionAuditoria } from '../models/auditLog.model';

/**
 * M31: a qué módulo pertenece cada acción de la bitácora y cómo se nombra en pantalla. La acción se sigue guardando como código
 * (es el contrato con los servicios que la escriben); el módulo y la etiqueta se derivan aquí, así no hay que tocar ningún registro
 * viejo para agruparlos ni duplicar la lista en el frontend.
 */
export const MODULOS_AUDITORIA = [
  { clave: 'ACCESO', nombre: 'Accesos y usuarios', prefijos: ['LOGIN_', 'PERFIL_CAMBIADO', 'USUARIO_', 'USUARIOS_', 'PASSWORD_', 'SESIONES_'] },
  {
    clave: 'MATRICULA',
    nombre: 'Matrículas y admisiones',
    prefijos: [
      'ADMISION_',
      'MATRICULA_',
      'INSCRIPCION_',
      'PREMATRICULA_',
      'CUPO_',
      'SOLICITUD_EN_ESPERA',
      'SOLICITUD_DOCUMENTO_',
      'CONTINUIDAD_',
      'FOLIATURA_',
      'DOCUMENTO_CARGADO',
      'DOCUMENTO_REVISADO',
      'DOCUMENTO_VERIFICADO_',
      'DOCUMENTO_VERIFICACION_',
      'DOCUMENTO_CHECKLIST_',
      'REQUISITO_DOCUMENTAL_',
      'OBSERVACION_CHECKLIST_',
      'PAZ_Y_SALVO_',
    ],
  },
  { clave: 'SALIDAS', nombre: 'Retiros, traslados y homologación', prefijos: ['SALIDA_', 'PAZ_Y_SALVO_SALIDA_', 'TRASLADO_', 'NOTA_HOMOLOGADA_', 'ESCALA_EXTERNA_'] },
  { clave: 'ESTUDIANTES', nombre: 'Estudiantes y acudientes', prefijos: ['ACUDIENTE_', 'EXPEDIENTE_DIGITAL_'] },
  {
    clave: 'INSTITUCION',
    nombre: 'Institución, sedes y espacios',
    prefijos: ['INSTITUCION_', 'SITIO_PUBLICO_', 'ESPACIO_', 'GRUPO_', 'JORNADA_', 'PLANTILLA_FRANJAS_'],
  },
  {
    clave: 'ANIO_LECTIVO',
    nombre: 'Año lectivo y calendario',
    prefijos: ['ANIO_LECTIVO_', 'PERIODO_', 'BLOQUEO_PERIODO_', 'PRORROGA_', 'CALENDARIO_', 'ESCALA_EVALUACION_', 'PONDERACION_', 'COMPONENTES_EVALUATIVOS_'],
  },
  {
    clave: 'CURRICULO',
    nombre: 'Plan de estudios y carga docente',
    prefijos: ['AREA_', 'ASIGNATURA_', 'PLAN_ASIGNATURAS_', 'PLAN_EVALUACION_', 'PLAN_DISTRIBUCION_', 'PLAN_CREADO_', 'ASIGNACION_DOCENTE_', 'CARGA_DOCENTE_', 'MALLA_GRUPO_', 'LIMITES_'],
  },
  { clave: 'PLANEACION', nombre: 'Planeación', prefijos: ['DOCUMENTO_REFERENCIA_', 'LIDER_AREA_', 'PLAN_AREA_', 'PLAN_AULA_', 'VENTANA_PLANES_'] },
  { clave: 'HORARIOS', nombre: 'Horarios', prefijos: ['VARIABLE_HORARIO_', 'HORARIO_'] },
  { clave: 'ACTIVIDADES', nombre: 'Actividades', prefijos: ['ACTIVIDAD_', 'ACTIVIDADES_', 'ALMACENAMIENTO_'] },
  {
    clave: 'NOTAS',
    nombre: 'Notas y boletines',
    prefijos: ['NOTAS_', 'PLANILLA_', 'PLANTILLA_PLANILLA_', 'CASILLA_', 'PESOS_', 'BOLETIN_', 'VALORACION_DESCRIPTIVA_'],
  },
  { clave: 'ASISTENCIA', nombre: 'Asistencia', prefijos: ['ESTADO_ASISTENCIA_', 'ASISTENCIA_', 'JUSTIFICACION_'] },
  {
    clave: 'CONVIVENCIA',
    nombre: 'Convivencia y orientación',
    prefijos: [
      'CONVIVENCIA_',
      'OBSERVACION_',
      'FALTA_',
      'SEGUIMIENTO_',
      'COMPROMISO_',
      'CITACION_OBSERVACION_',
      'SOLICITUD_CASO_',
      'REPORTE_URGENTE_',
      'CATALOGO_CONVIVENCIA_',
      'CONFIGURACION_CONVIVENCIA_',
      'CASO_CONVIVENCIA_',
      'ORIENTACION_',
      'PROTOCOLO_',
      'MIEMBRO_COMITE_',
      'SESION_COMITE_',
      'ACTA_COMITE_',
      'IMPORTACION_CONVIVENCIA',
      'RETENCION_',
    ],
  },
  { clave: 'INCLUSION', nombre: 'Inclusión (PIAR)', prefijos: ['INCLUSION_'] },
  {
    clave: 'PROMOCION',
    nombre: 'Recuperaciones, promoción y titulación',
    prefijos: ['RECUPERACION', 'PROMOCION_', 'TITULACION_', 'REMATRICULA_', 'COMISION_'],
  },
  { clave: 'CERTIFICADOS', nombre: 'Certificados y reportes', prefijos: ['CERTIFICADO', 'LIBRO_CALIFICACIONES_', 'REPORTE_CIERRE_'] },
  { clave: 'COMUNICACION', nombre: 'Anuncios, noticias y citaciones', prefijos: ['ANUNCIO_', 'NOTICIA_', 'CITACION_'] },
  { clave: 'PREDICTIVO', nombre: 'Módulo predictivo', prefijos: ['PREDICTIVO_'] },
  { clave: 'HISTORIAL', nombre: 'Historial de acciones', prefijos: ['HISTORIAL_'] },
] as const;

export type ModuloAuditoria = (typeof MODULOS_AUDITORIA)[number]['clave'] | 'OTRO';

// El prefijo más largo gana: CITACION_OBSERVACION_ es de convivencia aunque CITACION_ sea de comunicación.
const PREFIJOS = MODULOS_AUDITORIA.flatMap((m) => m.prefijos.map((p) => ({ prefijo: p as string, modulo: m.clave as ModuloAuditoria }))).sort(
  (a, b) => b.prefijo.length - a.prefijo.length
);

export function moduloDeAccion(accion: string): ModuloAuditoria {
  return PREFIJOS.find((p) => accion.startsWith(p.prefijo))?.modulo ?? 'OTRO';
}

export const nombreDeModulo = (modulo: ModuloAuditoria): string => MODULOS_AUDITORIA.find((m) => m.clave === modulo)?.nombre ?? 'Otros';

export const accionesDeModulo = (modulo: ModuloAuditoria): AccionAuditoria[] => ACCIONES_AUDITORIA.filter((a) => moduloDeAccion(a) === modulo);

/** Etiquetas escritas a mano: las de matrícula y acceso, que son las que más se consultan. El resto se arma del código. */
const ETIQUETAS: Partial<Record<AccionAuditoria, string>> = {
  LOGIN_EXITOSO: 'Inició sesión',
  LOGIN_FALLIDO: 'Intento de inicio de sesión fallido',
  PERFIL_CAMBIADO: 'Cambió de perfil',
  PASSWORD_RESETEADA: 'Contraseña restablecida',
  PASSWORD_CAMBIADA: 'Cambió su contraseña',
  SESIONES_CERRADAS: 'Sesiones cerradas',
  ADMISION_SOLICITADA: 'Solicitud de admisión recibida',
  ADMISION_APROBADA: 'Solicitud de admisión aprobada',
  ADMISION_ADMITIDA: 'Aspirante admitido',
  ADMISION_MATRICULADA: 'Matrícula formalizada desde admisión',
  ADMISION_RECHAZADA: 'Solicitud de admisión rechazada',
  MATRICULA_PREINSCRITA: 'Preinscripción creada',
  MATRICULA_CREADA: 'Matrícula creada',
  MATRICULA_ESTADO_CAMBIADO: 'Cambio de estado de la matrícula',
  MATRICULA_GRUPO_CAMBIADO: 'Cambio de grupo',
  MATRICULA_SOBRECUPO_AUTORIZADO: 'Sobrecupo autorizado',
  MATRICULA_REINGRESO: 'Reingreso del estudiante',
  MATRICULA_GRADO_CON_MOTIVO: 'Matriculado en otro grado (con motivo)',
  MATRICULA_REQUISITOS_SINCRONIZADOS: 'Requisitos documentales sincronizados',
  MATRICULA_PREINSCRITA_POR_PROMOCION: 'Pre-matrícula del año siguiente',
  INSCRIPCION_REGISTRADA: 'Inscripción en el mostrador',
  PREMATRICULA_CONFIGURADA: 'Prematrícula configurada',
  CUPO_RESERVADO: 'Cupo reservado',
  SOLICITUD_EN_ESPERA: 'Solicitud en lista de espera',
  SOLICITUD_DOCUMENTO_CARGADO: 'Documento de la solicitud cargado',
  SOLICITUD_DOCUMENTO_RETIRADO: 'Documento de la solicitud retirado',
  CONTINUIDAD_REGISTRADA: 'La familia confirmó la continuidad',
  CONTINUIDAD_RETIRADA: 'Continuidad retirada',
  FOLIATURA_CONFIGURADA: 'Foliatura del Libro de Matrícula configurada',
  DOCUMENTO_VERIFICADO_EN_FISICO: 'Documento verificado en físico',
  DOCUMENTO_VERIFICACION_FISICA_RETIRADA: 'Verificación en físico retirada',
  DOCUMENTO_CARGADO: 'Documento cargado',
  DOCUMENTO_REVISADO: 'Documento revisado',
  DOCUMENTO_CHECKLIST_AGREGADO: 'Documento agregado al checklist',
  DOCUMENTO_CHECKLIST_ELIMINADO: 'Documento quitado del checklist',
  OBSERVACION_CHECKLIST_ACTUALIZADA: 'Observación de un documento',
  PAZ_Y_SALVO_CONFIRMADO: 'Paz y salvo de fin de año confirmado',
  PAZ_Y_SALVO_RECHAZADO: 'Paz y salvo de fin de año rechazado',
  SALIDA_MATRICULA_REGISTRADA: 'Retiro o traslado registrado',
  SALIDA_CUPO_LIBERADO: 'Cupo liberado',
  PAZ_Y_SALVO_SALIDA_ABIERTO: 'Paz y salvo de salida abierto',
  PAZ_Y_SALVO_SALIDA_EXCEPCION: 'Paz y salvo de salida aprobado por excepción',
  TRASLADO_REGISTRADO: 'Traslado extemporáneo registrado',
  CERTIFICADO_EMITIDO: 'Certificado expedido',
  CERTIFICADO_ANULADO: 'Certificado anulado',
  HISTORIAL_EXPORTADO: 'Historial de acciones exportado',
};

// Palabras del código que llevan tilde o se escriben distinto en pantalla.
const PALABRAS: Record<string, string> = {
  matricula: 'matrícula', matriculas: 'matrículas', anio: 'año', periodo: 'periodo', asignacion: 'asignación', institucion: 'institución',
  sesion: 'sesión', configuracion: 'configuración', publicacion: 'publicación', orientacion: 'orientación', inclusion: 'inclusión',
  atencion: 'atención', remision: 'remisión', titulacion: 'titulación', promocion: 'promoción', recuperacion: 'recuperación',
  citacion: 'citación', categoria: 'categoría', habilitacion: 'habilitación', justificacion: 'justificación', admision: 'admisión',
  observacion: 'observación', evaluacion: 'evaluación', ponderacion: 'ponderación', prorroga: 'prórroga', valoracion: 'valoración',
  analisis: 'análisis', publico: 'público', comision: 'comisión', anulacion: 'anulación', nivelacion: 'nivelación', resolucion: 'resolución',
  area: 'área', areas: 'áreas', importacion: 'importación', retencion: 'retención', direccion: 'dirección', saber11: 'Saber 11',
  pdf: 'PDF', excel: 'Excel', revision: 'revisión',
};

export function etiquetaDeAccion(accion: string): string {
  const manual = ETIQUETAS[accion as AccionAuditoria];
  if (manual) return manual;
  const texto = accion
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((p) => PALABRAS[p] ?? p)
    .join(' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Pantalla a la que lleva un evento según lo que afectó (solo las que tienen una página propia). */
export function enlaceDeEntidad(entidad: string, entidadId: string | null): string | null {
  if (!entidadId) return null;
  switch (entidad) {
    case 'Enrollment':
      return `/admin/enrollments/${entidadId}`;
    case 'CasoConvivencia':
      return `/convivencia/casos/${entidadId}`;
    case 'ExpedienteInclusion':
      return `/inclusion/expedientes/${entidadId}`;
    case 'SesionComision':
      return `/comision/sesiones/${entidadId}`;
    case 'Activity':
      return `/admin/actividades/${entidadId}`;
    default:
      return null;
  }
}
