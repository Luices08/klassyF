import type { NavItem } from '../components/layout/navigation';
import type { DestinoAsistente } from '../hooks/useAsistente';

/** Palabras con las que la gente nombra cada pantalla, por ruta. Una pantalla nueva en el menú se suma aquí para que el asistente la encuentre. */
export const PALABRAS_CLAVE_POR_RUTA: Record<string, { descripcion: string; claves: string[]; aceptaGrado?: boolean }> = {
  '/panel': { descripcion: 'Resumen general de tu sesión.', claves: ['inicio', 'panel', 'resumen', 'principal'] },
  '/report-card': {
    descripcion: 'Boletín con las notas cerradas del periodo.',
    claves: ['boletin', 'boletines', 'informe academico', 'informe de evaluacion', 'notas finales', 'calificaciones del periodo', 'puesto', 'imprimir boletin', 'pdf del boletin'],
  },
  '/mi-horario': { descripcion: 'Tu horario de clases publicado.', claves: ['mi horario', 'horario de clases', 'que clase tengo'] },
  '/mi-cuenta': {
    descripcion: 'Tus datos y tu contraseña.',
    claves: ['cuenta', 'perfil', 'contrasena', 'clave', 'cambiar contrasena', 'mis datos'],
  },
  '/admin/setup': {
    descripcion: 'Datos de la institución, modalidad, plantilla de franjas y topes de carga y de horas.',
    claves: ['institucion', 'colegio', 'nit', 'dane', 'logo', 'modalidad', 'virtual', 'plantilla de franjas', 'topes', 'aforo', 'limite de horas'],
  },
  '/admin/sitio-publico': {
    descripcion: 'Plantilla, tipografía, colores, secciones e imágenes de la página pública del colegio.',
    claves: ['sitio publico', 'pagina publica', 'pagina de inicio', 'plantilla', 'personalizar', 'colores', 'tipo de letra', 'fuente', 'slider', 'carrusel', 'banner', 'logo'],
  },
  '/admin/sedes': {
    descripcion: 'Sedes, jornadas, días hábiles y franjas de clase y descanso.',
    claves: ['sede', 'sedes', 'jornada', 'jornadas', 'manana', 'tarde', 'franjas', 'descanso', 'dias habiles', 'hora de inicio'],
  },
  '/anio-lectivo': {
    descripcion: 'Año lectivo, periodos, calendario, prórrogas y cierre.',
    claves: [
      'anio lectivo',
      'periodo',
      'periodos',
      'calendario',
      'vacaciones',
      'receso',
      'prorroga',
      'cierre del anio',
      'fechas',
      'entrega de planes',
      'fecha limite de planes',
      'ventana de entrega',
      'activar anio',
    ],
  },
  '/admin/grades': {
    descripcion: 'Catálogo de grados que ofrece la institución.',
    claves: ['grados', 'catalogo de grados', 'activar grado', 'desactivar grado'],
  },
  '/admin/users': {
    descripcion: 'Directorio de usuarios y roles.',
    claves: ['usuarios', 'usuario', 'roles', 'crear usuario', 'docentes', 'resetear contrasena', 'cuentas'],
  },
  '/admin/historial': {
    descripcion: 'Historial de acciones: quién creó, editó, matriculó o eliminó algo en el sistema y cuándo (bitácora de auditoría).',
    claves: ['historial', 'historial de acciones', 'auditoria', 'bitacora', 'quien hizo', 'quien cambio', 'quien creo', 'quien edito', 'quien elimino', 'quien borro', 'registro de cambios', 'trazabilidad', 'log'],
  },
  '/admin/students': {
    descripcion: 'Estudiantes y su ficha completa.',
    claves: ['estudiantes', 'estudiante', 'alumnos', 'ficha del estudiante', 'acudiente', 'acudientes'],
  },
  '/admin/groups': {
    descripcion: 'Grupos, cupos, aula y ficha 360° de cada grupo.',
    claves: ['grupos', 'grupo', 'cupos', 'cupo', 'curso', 'cursos', 'director de grupo', 'ficha del grupo'],
  },
  '/admin/espacios': {
    descripcion: 'Aulas, laboratorios y otros espacios físicos.',
    claves: ['espacios', 'aulas', 'salon', 'salones', 'laboratorio', 'aforo', 'capacidad del salon'],
  },
  '/admin/academic-catalog': {
    descripcion: 'Áreas y asignaturas del colegio, y los docentes líderes de cada área.',
    claves: ['catalogo academico', 'areas', 'area', 'asignaturas', 'asignatura', 'materias', 'materia', 'lider', 'lideres', 'jefe de area', 'jefes de area', 'coordinador de area'],
  },
  '/admin/study-plan': {
    aceptaGrado: true,
    descripcion: 'Intensidad horaria semanal de cada asignatura por grado, y su ponderación.',
    claves: [
      'intensidad horaria',
      'intensidad',
      'horas semanales',
      'horas por asignatura',
      'plan de estudios',
      'malla curricular',
      'ponderacion',
      'cuantas horas',
    ],
  },
  '/admin/teacher-assignments': {
    descripcion: 'Qué docente dicta cada asignatura y dirige cada grupo.',
    claves: ['carga academica', 'carga docente', 'asignacion docente', 'asignar docente', 'quien dicta', 'direccion de grupo'],
  },
  '/admin/horarios': {
    descripcion: 'Generar, ajustar y publicar los horarios; restricciones y tiempo libre de docentes.',
    claves: ['horarios', 'generar horario', 'publicar horario', 'restricciones', 'tiempo libre', 'disponibilidad', 'cruce de horarios', 'conflictos'],
  },
  '/admin/revision-planeacion': {
    descripcion: 'Revisión de planes de área y planes de aula: aprobar, devolver con comentarios y ver quién falta por radicar.',
    claves: [
      'revision de planeacion',
      'planeacion',
      'planes de aula',
      'plan de aula',
      'plan de area',
      'planes de area',
      'aprobar plan',
      'devolver plan',
      'fuera de plazo',
      'cobertura de planes',
      'quien no ha subido el plan',
    ],
  },
  '/admin/documentos-referencia': {
    descripcion: 'PDF de apoyo (DBA, estándares, lineamientos) asignados a un área y a los grados donde aplican.',
    claves: ['documentos de apoyo', 'documentos de referencia', 'dba', 'estandares', 'lineamientos curriculares', 'pdf de apoyo', 'subir documento'],
  },
  '/admin/actividades': {
    descripcion: 'Supervisión de actividades por grupo y límites de carga diaria.',
    claves: ['actividades por grupo', 'supervisar actividades', 'sobrecarga', 'evaluaciones por dia'],
  },
  '/admin/notas': {
    descripcion: 'Seguimiento de planillas de notas y cierre definitivo.',
    claves: ['seguimiento de notas', 'planillas', 'declarar definitivas', 'notas pendientes'],
  },
  '/admin/creador-planillas': {
    descripcion: 'Molde de la nota (bloques y porcentajes) e impresión de planillas.',
    claves: ['creador de planillas', 'molde', 'bloques', 'casillas', 'porcentajes de la nota', 'formato de planilla', 'firmas'],
  },
  '/admin/boletin': {
    descripcion: 'Diseño del boletín (escudo, secciones, firmas), textos por desempeño, entrega, reclamaciones y quién ve el boletín.',
    claves: ['diseno del boletin', 'disenar boletin', 'escudo del boletin', 'logo del boletin', 'cambiar escudo', 'posicion del escudo', 'marca de agua', 'firmas del boletin', 'titulo del boletin', 'publicar boletin', 'quien ve el boletin', 'acceso al boletin', 'bloquear boletin', 'vista previa del boletin', 'boletin de muestra', 'configuracion del boletin', 'textos del boletin', 'descripcion del desempeno', 'recomendaciones', 'fecha de entrega', 'reclamaciones', 'canal de reclamaciones', 'mostrar puesto', 'siee'],
  },
  '/docente/boletin-observaciones': {
    descripcion: 'Comentarios por estudiante que salen en el boletín de tu asignatura.',
    claves: ['observaciones del boletin', 'observaciones para el boletin', 'comentarios del boletin', 'escribir observacion', 'comentario por estudiante'],
  },
  '/docente/mi-carga': { descripcion: 'Tus asignaturas y grupos asignados.', claves: ['mi asignacion', 'mi carga', 'mis clases', 'mis grupos'] },
  '/docente/planeacion': {
    descripcion: 'Tu plan de aula de cada periodo y, si lideras un área, el plan de área anual (PDF).',
    claves: ['planeacion', 'plan de aula', 'plan de area', 'cargar plan', 'subir plan', 'radicar plan', 'adoptar plan', 'plan curricular', 'docente anterior'],
  },
  '/docente/actividades': {
    descripcion: 'Programar actividades y revisar entregas.',
    claves: ['actividades', 'tareas', 'programar actividad', 'entregas', 'evaluacion'],
  },
  '/recuperaciones': {
    descripcion: 'Política de recuperaciones del colegio y registro de resultados.',
    claves: ['recuperacion', 'recuperaciones', 'recuperar', 'nivelacion', 'refuerzo', 'perdio la materia', 'recuperacion de fin de año', 'siee'],
  },
  '/admin/promocion': {
    descripcion: 'Promoción y cierre del año: política del colegio (SIEE), cierre de la promoción por grupo y paso de los estudiantes al año siguiente.',
    claves: ['promocion', 'promover', 'cierre del año', 'cerrar el año', 'reprobar', 'perdio el año', 'no promovido', 'repitente', 'año siguiente', 'rollover', 'pre matricula', 'reservar cupos', 'reglas de promocion', 'siee'],
  },
  '/admin/reportes-cierre': {
    descripcion: 'Reportes de cierre anual: sábana de calificaciones en Excel y PDF por año, sede, jornada, grado o grupo, e informe final del año por grupo con su publicación para las familias, y listados de estudiantes en recuperación final, de retirados del servicio social de décimo y once, la plantilla de cierre para SIMAT el balance anual de inclusión (PIAR) y el libro de calificaciones foliado.',
    claves: ['sabana', 'sábana', 'sabana de notas', 'matriz de calificaciones', 'calificaciones finales', 'notas finales', 'exportar notas', 'reporte de cierre', 'excel de notas', 'consolidado de notas', 'informe final', 'informe final del año', 'boletín final', 'publicar informe final', 'recuperación final', 'estudiantes en recuperación', 'nivelación', 'retirados', 'desertores', 'deserción', 'servicio social', 'horas de servicio social', 'consolidado de servicio social', 'simat', 'cierre simat', 'plantilla simat', 'reporte al ministerio', 'balance de inclusión', 'balance piar', 'informe anual de inclusión', 'libro de calificaciones', 'registro escolar', 'folios', 'libro de notas'],
  },
  '/noticias': {
    descripcion: 'Noticias y eventos de la institución: feria de ciencias, reunión de padres, día de la Virgen, jornadas deportivas… con fecha, lugar y categoría; quien puede publicar las crea aquí, y administración y secretaría manejan las categorías y habilitan a docentes.',
    claves: ['noticias', 'noticia', 'eventos', 'evento', 'feria de ciencias', 'reunion de padres', 'dia de la virgen', 'dia mariano', 'jornada deportiva', 'celebracion', 'publicar noticia', 'agenda del colegio', 'categorias de noticias', 'habilitar docente', 'docentes que publican', 'proximos eventos'],
  },
  '/admin/reporte-c600': {
    descripcion: 'Reporte estadístico con la estructura del formulario C-600 del DANE: balance de matrícula, resultados (aprobados, reprobados y desertores) por grado y sexo, y edad por grado, en pantalla, Excel y PDF.',
    claves: ['c600', 'c-600', 'dane', 'reporte dane', 'estadistica dane', 'formulario dane', 'eficiencia interna', 'matricula inicial', 'matricula final', 'desertores', 'desercion', 'extraedad', 'edad por grado', 'aprobados y reprobados por grado', 'estadisticas del colegio', 'reporte al dane'],
  },
  '/admin/promocion-anticipada': {
    descripcion: 'Promoción anticipada de estudiantes destacados y reiniciantes, con consentimiento, resolución rectoral y paso de grado.',
    claves: ['promocion anticipada', 'adelantar de grado', 'saltar de grado', 'reiniciante', 'resolucion rectoral', 'subir de grado', 'rendimiento excepcional'],
  },
  '/comision': {
    descripcion: 'Comisión de evaluación y promoción: tablero de riesgo académico, sesiones, votaciones, compromisos y actas firmadas.',
    claves: ['comision de evaluacion', 'comision de promocion', 'consejo academico', 'consejo directivo', 'acta', 'firmar acta', 'sesion', 'semaforo', 'riesgo academico', 'reprobacion masiva', 'compromisos'],
  },
  '/secretaria/titulacion': {
    descripcion: 'Titulación de bachiller: servicio social, Saber 11, carpeta académica y quién se gradúa.',
    claves: ['titulacion', 'graduacion', 'graduar', 'bachiller', 'servicio social', 'saber 11', 'pruebas saber', 'grado por ventanilla', 'acta de grado', 'diploma', 'graduandos'],
  },
  '/docente/notas': {
    descripcion: 'Planilla de notas de tus clases.',
    claves: ['planilla de notas', 'poner notas', 'calificar', 'registrar notas', 'subir notas'],
  },
  '/docente/asistencia': {
    descripcion: 'Planilla de asistencia del mes y registro diario.',
    claves: ['tomar asistencia', 'asistencia', 'lista', 'llamar a lista', 'fallas', 'retardos'],
  },
  '/asistencia/gestion': {
    descripcion: 'Estadísticas, justificaciones y reportes de asistencia.',
    claves: ['gestion de asistencia', 'justificaciones', 'excusas', 'reporte de asistencia', 'ausentismo', 'estados de asistencia'],
  },
  '/admin/enrollments': {
    descripcion: 'Matrículas, libro de matrícula y el catálogo de documentos que se piden al matricular.',
    claves: ['matriculas', 'matricula', 'matricular', 'folio', 'libro de matricula', 'documentos de matricula', 'documentos que se piden', 'requisitos de matricula', 'configurar documentos'],
  },
  '/admin/documentos-por-revisar': {
    descripcion: 'Bandeja de documentos de matrícula subidos que falta aprobar o rechazar.',
    claves: ['documentos por revisar', 'revisar documentos', 'aprobar documentos', 'documentos pendientes', 'bandeja de documentos', 'checklist'],
  },
  '/paz-y-salvo': {
    descripcion: 'Paz y salvo de fin de año de los estudiantes, para su matrícula del año siguiente.',
    claves: ['paz y salvo', 'pazysalvo', 'fin de ano', 'estar a paz y salvo', 'debe libros', 'renovar matricula'],
  },
  '/secretaria/rematricula': {
    descripcion: 'Rematrícula de fin de año por sede, grado o grupo: simula y confirma las pre-matrículas del año siguiente, lista de espera por falta de cupos y reglas de prioridad.',
    claves: ['rematricula', 'rematricular', 'renovar matricula', 'matricula del ano siguiente', 'pasar de ano', 'pre matricula', 'prematricula', 'lista de espera', 'cupos del ano siguiente', 'repitentes', 'proyeccion de matricula'],
  },
  '/secretaria/traslados': {
    descripcion: 'Traslados extemporáneos de estudiantes y homologación de las notas del colegio de procedencia.',
    claves: ['traslado', 'traslados', 'homologacion', 'homologar', 'notas homologadas', 'exenta', 'exento por traslado', 'colegio de procedencia', 'llego a mitad de ano', 'escala de otro colegio'],
  },
  '/reuniones': {
    descripcion: 'Citaciones a acudientes: reunión de entrega de boletines o citación particular por comportamiento o rendimiento, con correo y confirmación de asistencia.',
    claves: ['citacion', 'citar acudiente', 'reunion de padres', 'reunion de acudientes', 'entrega de boletines', 'citar padres', 'confirmar asistencia', 'agenda de reuniones', 'convocar'],
  },
  '/secretaria/salidas': {
    descripcion: 'Retiro o traslado de un estudiante durante el año: fecha efectiva, paz y salvo de salida y boletín parcial de retiro.',
    claves: ['retiro', 'retirar', 'retirar estudiante', 'traslado a otro colegio', 'salida de estudiante', 'se fue del colegio', 'paz y salvo de salida', 'boletin de retiro', 'liberar cupo', 'desertor'],
  },
  '/admin/admisiones': {
    descripcion: 'Solicitudes de admisión y preinscripciones.',
    claves: ['admisiones', 'admision', 'preinscripcion', 'aspirantes', 'solicitudes de cupo'],
  },
  '/convivencia/observador': {
    descripcion: 'Observador del estudiante: observaciones y faltas.',
    claves: ['observador', 'observaciones', 'registrar falta', 'anotacion', 'comportamiento', 'disciplina'],
  },
  '/convivencia/catalogo': {
    descripcion: 'Manual de convivencia: faltas, medidas, protocolos y plazos.',
    claves: ['catalogo de convivencia', 'manual de convivencia', 'faltas', 'medidas', 'protocolos', 'tipos de observacion'],
  },
  '/convivencia/casos': { descripcion: 'Casos formales de convivencia.', claves: ['casos de convivencia', 'casos', 'debido proceso', 'descargos'] },
  '/convivencia/comite': {
    descripcion: 'Comité de convivencia, sesiones y actas.',
    claves: ['comite de convivencia', 'comite', 'actas', 'acta', 'sesion', 'quorum'],
  },
  '/convivencia/solicitudes': {
    descripcion: 'Solicitudes de caso enviadas por los docentes.',
    claves: ['solicitudes de caso', 'solicitud de caso', 'abrir caso', 'reportes de docentes'],
  },
  '/inclusion': {
    descripcion: 'PIAR y planes de apoyo pedagógico.',
    claves: ['inclusion', 'piar', 'plan de apoyo', 'discapacidad', 'ajustes razonables', 'necesidades educativas'],
  },
  '/docente/ajustes-razonables': {
    descripcion: 'Estudiantes con ajustes razonables en tus clases.',
    claves: ['estudiantes con ajustes', 'ajustes razonables', 'mis ajustes', 'piar de mis estudiantes'],
  },
  '/orientacion/remisiones': {
    descripcion: 'Remisiones a orientación y sus atenciones.',
    claves: ['remisiones', 'orientacion', 'psicologia', 'atencion psicosocial'],
  },
  '/mis-actividades': { descripcion: 'Tus actividades y entregas.', claves: ['mis actividades', 'mis tareas', 'entregar tarea', 'pendientes'] },
  '/portal': {
    descripcion: 'Portal del acudiente: notas, inasistencias, convivencia, documentos de matrícula y certificados de tus estudiantes a cargo.',
    claves: ['portal', 'portal del acudiente', 'mis hijos', 'mi hijo', 'notas de mi hijo', 'inasistencias de mi hijo', 'fallas de mi hijo', 'subir documentos', 'documentos pendientes', 'documentos de matricula', 'constancia de estudio', 'certificado de estudio', 'descargar certificado', 'observador de mi hijo'],
  },
  '/anuncios': { descripcion: 'Tablero de anuncios de la institución; coordinación y administración los publican.', claves: ['anuncios', 'avisos', 'comunicados', 'circulares', 'publicar anuncio', 'tablero'] },
  '/mis-notas': { descripcion: 'Tus notas por asignatura.', claves: ['mis notas', 'ver mis notas', 'cuanto llevo', 'mis calificaciones'] },
  '/mi-observador': { descripcion: 'Tu observador.', claves: ['mi observador', 'mis observaciones', 'mis faltas'] },
  '/predictivo': {
    descripcion: 'Análisis predictivo de un estudiante: riesgo de perder cada asignatura, nota que le falta, FODA y riesgo de no promoción; el administrador entrena la IA.',
    claves: ['predictivo', 'riesgo academico', 'estudiantes en riesgo', 'foda', 'prediccion', 'entrenar ia', 'inteligencia artificial', 'quien va a perder'],
  },
  '/mi-analisis': { descripcion: 'Tu análisis: qué nota te falta en cada asignatura y tu FODA.', claves: ['mi analisis', 'mi foda', 'que me falta', 'cuanto necesito para pasar'] },
};

const PALABRAS_VACIAS = new Set([
  'a', 'al', 'como', 'con', 'cual', 'cuales', 'de', 'del', 'donde', 'el', 'en', 'es', 'esta', 'estan', 'hay', 'la', 'las', 'lo', 'los',
  'me', 'mi', 'mis', 'necesito', 'para', 'por', 'puedo', 'que', 'quiero', 'se', 'si', 'son', 'su', 'sus', 'un', 'una', 'unos', 'ver',
  'y', 'ir', 'llevame', 'encuentro', 'encontrar', 'ubicado', 'ubicada', 'esta', 'hacer', 'buscar', 'busco',
]);

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function raiz(palabra: string): string {
  return palabra.length > 4 ? palabra.replace(/(es|s)$/, '') : palabra;
}

/** Lo que se le cuenta al servidor de cada pantalla que el usuario puede abrir. */
export function destinosParaServidor(items: NavItem[]): DestinoAsistente[] {
  return items.map((item) => ({
    ruta: item.to,
    nombre: item.label,
    descripcion: PALABRAS_CLAVE_POR_RUTA[item.to]?.descripcion ?? '',
    acepta_grado: PALABRAS_CLAVE_POR_RUTA[item.to]?.aceptaGrado ?? false,
  }));
}

export interface Coincidencia {
  item: NavItem;
  descripcion: string;
  puntaje: number;
}

function puntuar(consulta: string, tokens: string[], claves: string[]): number {
  const envuelta = ` ${consulta} `;
  let puntaje = 0;
  for (const claveCruda of claves) {
    const clave = normalizar(claveCruda);
    const palabras = clave.split(' ');
    if (envuelta.includes(` ${clave} `)) {
      puntaje += 2 + palabras.length * 2;
      continue;
    }
    // Una clave de una sola palabra también cuenta si coincide la raíz (horas ≈ hora, grados ≈ grado).
    if (palabras.length === 1 && clave.length >= 4) {
      const raizClave = raiz(clave);
      if (tokens.some((t) => t.length >= 4 && raiz(t) === raizClave)) puntaje += 2;
    }
  }
  return puntaje;
}

/** Ordena de mayor a menor las pantallas del menú (ya filtradas por rol) que mejor responden a la pregunta. */
export function buscarDestinos(pregunta: string, items: NavItem[]): Coincidencia[] {
  const consulta = normalizar(pregunta);
  const tokens = consulta.split(' ').filter((t) => t && !PALABRAS_VACIAS.has(t));
  if (tokens.length === 0) return [];

  const resultados: Coincidencia[] = [];
  for (const item of items) {
    const entrada = PALABRAS_CLAVE_POR_RUTA[item.to];
    const claves = [item.label, ...(entrada?.claves ?? [])];
    const puntaje = puntuar(consulta, tokens, claves);
    if (puntaje > 0) resultados.push({ item, descripcion: entrada?.descripcion ?? '', puntaje });
  }
  return resultados.sort((a, b) => b.puntaje - a.puntaje);
}

/** Una pantalla a la que el asistente llevó al usuario en esta visita. `url` conserva el filtro con que se abrió (p. ej. `?grado=`). */
export interface LugarVisitado {
  ruta: string;
  url: string;
  nombre: string;
}

export const MAX_LUGARES_VISITADOS = 12;

/**
 * Suma una pantalla a los lugares visitados: la más reciente va primero y una pantalla no se repite (si se vuelve a visitar,
 * sube al principio y recuerda la última dirección con la que se abrió). Al pasar el tope se descarta la más antigua.
 */
export function registrarVisita(visitados: LugarVisitado[], nuevo: LugarVisitado): LugarVisitado[] {
  return [nuevo, ...visitados.filter((v) => v.ruta !== nuevo.ruta)].slice(0, MAX_LUGARES_VISITADOS);
}

/** La primera es clara si saca ventaja suficiente sobre la segunda: ahí el asistente navega solo; si no, deja elegir. */
export function destinoClaro(coincidencias: Coincidencia[]): Coincidencia | null {
  const [primera, segunda] = coincidencias;
  if (!primera) return null;
  if (!segunda || primera.puntaje >= segunda.puntaje + 3) return primera;
  return null;
}
