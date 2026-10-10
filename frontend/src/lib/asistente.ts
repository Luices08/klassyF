import type { NavItem } from '../components/layout/navigation';
import type { DestinoAsistente } from '../hooks/useAsistente';

/** Palabras con las que la gente nombra cada pantalla, por ruta. Una pantalla nueva en el menú se suma aquí para que el asistente la encuentre. */
export const PALABRAS_CLAVE_POR_RUTA: Record<string, { descripcion: string; claves: string[]; aceptaGrado?: boolean }> = {
  '/panel': { descripcion: 'Resumen general de tu sesión.', claves: ['inicio', 'panel', 'resumen', 'principal'] },
  '/report-card': {
    descripcion: 'Boletín con las notas cerradas del periodo.',
    claves: ['boletin', 'informe academico', 'notas finales', 'calificaciones del periodo', 'puesto'],
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
  '/admin/sedes': {
    descripcion: 'Sedes, jornadas, días hábiles y franjas de clase y descanso.',
    claves: ['sede', 'sedes', 'jornada', 'jornadas', 'manana', 'tarde', 'franjas', 'descanso', 'dias habiles', 'hora de inicio'],
  },
  '/anio-lectivo': {
    descripcion: 'Año lectivo, periodos, calendario, prórrogas y cierre.',
    claves: ['anio lectivo', 'periodo', 'periodos', 'calendario', 'vacaciones', 'receso', 'prorroga', 'cierre del anio', 'fechas'],
  },
  '/admin/grades': {
    descripcion: 'Catálogo de grados que ofrece la institución.',
    claves: ['grados', 'catalogo de grados', 'activar grado', 'desactivar grado'],
  },
  '/admin/users': {
    descripcion: 'Directorio de usuarios y roles.',
    claves: ['usuarios', 'usuario', 'roles', 'crear usuario', 'docentes', 'resetear contrasena', 'cuentas'],
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
    descripcion: 'Áreas y asignaturas del colegio.',
    claves: ['catalogo academico', 'areas', 'area', 'asignaturas', 'asignatura', 'materias', 'materia'],
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
  '/admin/revision-curricular': {
    descripcion: 'Revisión de las planeaciones curriculares de los docentes.',
    claves: ['revision curricular', 'planeaciones', 'aprobar planeacion', 'dba', 'ebc', 'lineamientos'],
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
  '/docente/mi-carga': { descripcion: 'Tus asignaturas y grupos asignados.', claves: ['mi asignacion', 'mi carga', 'mis clases', 'mis grupos'] },
  '/docente/planeacion-curricular': {
    descripcion: 'Planeación curricular por periodo.',
    claves: ['planeacion', 'planeacion curricular', 'contenidos', 'metodologia', 'dba'],
  },
  '/docente/actividades': {
    descripcion: 'Programar actividades y revisar entregas.',
    claves: ['actividades', 'tareas', 'programar actividad', 'entregas', 'evaluacion'],
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
    descripcion: 'Matrículas y libro de matrícula.',
    claves: ['matriculas', 'matricula', 'matricular', 'folio', 'libro de matricula'],
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
  '/mis-notas': { descripcion: 'Tus notas por asignatura.', claves: ['mis notas', 'ver mis notas', 'cuanto llevo', 'mis calificaciones'] },
  '/mi-observador': { descripcion: 'Tu observador.', claves: ['mi observador', 'mis observaciones', 'mis faltas'] },
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

/** La primera es clara si saca ventaja suficiente sobre la segunda: ahí el asistente navega solo; si no, deja elegir. */
export function destinoClaro(coincidencias: Coincidencia[]): Coincidencia | null {
  const [primera, segunda] = coincidencias;
  if (!primera) return null;
  if (!segunda || primera.puntaje >= segunda.puntaje + 3) return primera;
  return null;
}
