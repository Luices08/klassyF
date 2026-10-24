import { EventoNotificacion } from '../constants/notificaciones';

export interface DatosNotificacion {
  actividad?: string;
  estudiante?: string;
  area?: string;
  asignatura?: string;
  periodo?: number;
  grupo?: string;
  dias?: number;
  motivo?: string;
  /** Nombre de un evento del calendario. */
  nombre?: string;
  decision?: 'APROBADA' | 'RECHAZADA';
  /** Fecha y hora ya escritas (hora de Colombia) de una citación. */
  cuando?: string;
  /** Título de una noticia o evento institucional y su categoría. */
  titulo?: string;
  categoria?: string;
  /** Recuperaciones (M18): de un periodo o de fin de año, cuántos estudiantes/asignaturas quedan por recuperar y la nota anterior y la nueva. */
  tipo_recuperacion?: 'PERIODO' | 'ANUAL';
  cantidad?: number;
  nota_anterior?: number;
  nota_nueva?: number;
  superada?: boolean;
  intentos_restantes?: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** «la recuperación del periodo 2» / «la recuperación de fin de año». */
const cual = (datos: DatosNotificacion): string =>
  datos.tipo_recuperacion === 'ANUAL' ? 'la recuperación de fin de año' : `la recuperación del periodo ${datos.periodo ?? '?'}`;
const mayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);
const nota = (n: number | undefined): string => (typeof n === 'number' ? n.toFixed(2) : '—');

/** Título y texto de una alerta según cuántas se acumularon. Pura: la usa el servidor al leer y las pruebas. */
export function renderizarNotificacion(evento: EventoNotificacion, contador: number, datos: DatosNotificacion = {}): { titulo: string; mensaje: string } {
  const n = Math.max(1, contador);
  switch (evento) {
    case 'ENTREGA_NUEVA':
      return {
        titulo: 'Entregas nuevas',
        mensaje: `Tienes ${n} ${plural(n, 'entrega nueva', 'entregas nuevas')} en la actividad «${datos.actividad ?? 'sin nombre'}»${datos.grupo ? ` del grupo ${datos.grupo}` : ''}.`,
      };
    case 'ACTIVIDAD_CALIFICADA':
      return { titulo: 'Actividad calificada', mensaje: `Tu docente calificó «${datos.actividad ?? 'una actividad'}».` };
    case 'PLAN_DEVUELTO':
      return {
        titulo: 'Plan devuelto',
        mensaje: `Coordinación devolvió ${datos.asignatura ? `el plan de aula de ${datos.asignatura}` : `el plan de área de ${datos.area ?? 'tu área'}`} con comentarios para corregir.`,
      };
    case 'PLAN_APROBADO':
      return {
        titulo: 'Plan aprobado',
        mensaje: `Coordinación aprobó ${datos.asignatura ? `el plan de aula de ${datos.asignatura}` : `el plan de área de ${datos.area ?? 'tu área'}`}.`,
      };
    case 'DOCUMENTO_RECHAZADO':
      return {
        titulo: 'Documento rechazado',
        mensaje: `Secretaría rechazó un documento de matrícula${datos.estudiante ? ` de ${datos.estudiante}` : ''}${datos.motivo ? `: ${datos.motivo}` : ''}. Súbelo de nuevo desde el portal.`,
      };
    case 'BOLETIN_PUBLICADO':
      return {
        titulo: 'Boletín publicado',
        mensaje: `Ya está disponible el boletín del periodo ${datos.periodo ?? ''}${datos.estudiante ? ` de ${datos.estudiante}` : ''}.`.replace('  ', ' '),
      };
    // Sin hechos ni nombres: el caso está en debido proceso y el detalle se trata con la institución, no en una alerta.
    case 'FALTA_GRAVE':
      return {
        titulo: 'Situación de convivencia',
        mensaje: `Se registró una situación de convivencia que requiere atención${datos.estudiante ? ` de ${datos.estudiante}` : ''}. Comunícate con la institución.`,
      };
    // Sin hechos ni nombres: el detalle se lee en la bandeja de solicitudes, que está acotada a convivencia.
    case 'REPORTE_URGENTE':
      return {
        titulo: 'Reporte urgente de convivencia',
        mensaje: `Hay ${n} ${plural(n, 'reporte urgente', 'reportes urgentes')} de convivencia por atender. Abre la bandeja de solicitudes.`,
      };
    case 'CIERRE_PERIODO_PROXIMO':
      return {
        titulo: 'Cierre de periodo',
        mensaje: `El periodo ${datos.periodo ?? ''} cierra ${datos.dias === 0 ? 'hoy' : `en ${datos.dias ?? '?'} ${plural(datos.dias ?? 0, 'día', 'días')}`}. Revisa que tus notas estén completas.`,
      };
    case 'INASISTENCIA_REGISTRADA':
      return {
        titulo: 'Inasistencia registrada',
        mensaje: `Se ${plural(n, 'registró 1 inasistencia nueva', `registraron ${n} inasistencias nuevas`)}${datos.estudiante ? ` de ${datos.estudiante}` : ''}. Revisa el detalle y justifícala si corresponde.`,
      };
    case 'OBSERVACION_REGISTRADA':
      return {
        titulo: 'Observador',
        mensaje: `Hay ${n} ${plural(n, 'registro nuevo', 'registros nuevos')} en el observador${datos.estudiante ? ` de ${datos.estudiante}` : ''}.`,
      };
    case 'ACTIVIDAD_NUEVA':
      return {
        titulo: 'Actividad nueva',
        mensaje: `Tu docente publicó ${n} ${plural(n, 'actividad nueva', 'actividades nuevas')}${datos.asignatura ? ` en ${datos.asignatura}` : ''}.`,
      };
    case 'JUSTIFICACION_REVISADA':
      return {
        titulo: 'Justificación revisada',
        mensaje: `Coordinación ${datos.decision === 'APROBADA' ? 'aprobó' : 'rechazó'} la justificación de inasistencia${datos.estudiante ? ` de ${datos.estudiante}` : ''}.${datos.decision === 'RECHAZADA' && datos.motivo ? ` Motivo: ${datos.motivo}` : ''}`,
      };
    case 'RECORDATORIO_CALENDARIO':
      return {
        titulo: 'Próximamente',
        mensaje: `${datos.nombre ?? 'Un evento del calendario'} ${datos.dias === 0 ? 'es hoy' : `empieza en ${datos.dias ?? '?'} ${plural(datos.dias ?? 0, 'día', 'días')}`}.`,
      };
    case 'NOTICIA_NUEVA':
      // Las nuevas se acumulan en una sola alerta: con una sola se dice cuál es; con varias, cuántas hay.
      return n === 1
        ? { titulo: datos.categoria ? `Nuevo: ${datos.categoria}` : 'Noticia nueva', mensaje: `«${datos.titulo ?? 'Una noticia'}»${datos.cuando ? ` · ${datos.cuando}` : ''}.` }
        : { titulo: 'Noticias y eventos nuevos', mensaje: `Hay ${n} noticias y eventos nuevos. El último: «${datos.titulo ?? 'sin título'}».` };
    case 'CITACION_NUEVA':
      return {
        titulo: 'Nueva citación',
        mensaje: `Te citaron a «${datos.nombre ?? 'una reunión'}»${datos.estudiante ? ` por ${datos.estudiante}` : ''}${datos.cuando ? `: ${datos.cuando}` : ''}. Confirma tu asistencia en el portal.`,
      };
    case 'CITACION_REPROGRAMADA':
      return {
        titulo: 'Citación reprogramada',
        mensaje: `Cambió la fecha o el lugar de «${datos.nombre ?? 'la reunión'}»${datos.estudiante ? ` por ${datos.estudiante}` : ''}${datos.cuando ? `: ${datos.cuando}` : ''}. Confirma de nuevo tu asistencia.`,
      };
    case 'CITACION_CANCELADA':
      return { titulo: 'Citación cancelada', mensaje: `Se canceló «${datos.nombre ?? 'la reunión'}»${datos.estudiante ? ` por ${datos.estudiante}` : ''}.` };
    case 'CITACION_RESPONDIDA':
      return {
        titulo: 'Respuestas a tu citación',
        mensaje: `${n} ${plural(n, 'acudiente respondió', 'acudientes respondieron')} a «${datos.nombre ?? 'tu citación'}».`,
      };
    case 'RECUPERACION_FECHAS':
      return {
        titulo: 'Fechas de recuperación',
        mensaje: `${mayuscula(cual(datos))} ${datos.cuando ?? 'ya tiene fechas'}.${datos.cantidad ? ` Tienes ${datos.cantidad} ${plural(datos.cantidad, 'estudiante', 'estudiantes')} por recuperar.` : ''}`,
      };
    case 'RECUPERACION_INICIA':
      return {
        titulo: 'Hoy empieza la recuperación',
        mensaje: `${mayuscula(cual(datos))} empieza hoy y va ${datos.cuando ?? 'en las fechas del calendario'}. Tienes ${datos.cantidad ?? 0} ${plural(datos.cantidad ?? 0, 'estudiante', 'estudiantes')} por recuperar.`,
      };
    case 'RECUPERACION_TERMINA_MANANA':
      return {
        titulo: 'La recuperación termina mañana',
        mensaje: `${mayuscula(cual(datos))} termina mañana. Aún tienes ${datos.cantidad ?? 0} ${plural(datos.cantidad ?? 0, 'estudiante', 'estudiantes')} sin superarla.`,
      };
    case 'RECUPERACION_HABILITADA': {
      const cuantas = `${datos.cantidad ?? 0} ${plural(datos.cantidad ?? 0, 'asignatura', 'asignaturas')}`;
      return {
        titulo: 'Recuperación habilitada',
        mensaje: datos.estudiante
          ? `${datos.estudiante} tiene ${cuantas} por recuperar: ${cual(datos)} va ${datos.cuando ?? 'en las fechas del calendario'}. Pueden hablar con el docente de cada asignatura.`
          : `Tienes ${cuantas} por recuperar: ${cual(datos)} va ${datos.cuando ?? 'en las fechas del calendario'}. Habla con tu docente.`,
      };
    }
    case 'RECUPERACION_REGISTRADA': {
      if (n > 1) {
        return {
          titulo: 'Recuperaciones registradas',
          mensaje: `Se registraron ${n} resultados de recuperación${datos.estudiante ? ` de ${datos.estudiante}` : ''}. Revisa las notas para ver cómo quedaron.`,
        };
      }
      const resultado = datos.superada
        ? 'la superó'
        : `no la superó${datos.intentos_restantes ? `, le ${plural(datos.intentos_restantes, 'queda', 'quedan')} ${datos.intentos_restantes} ${plural(datos.intentos_restantes, 'intento', 'intentos')}` : ''}`;
      const de = datos.estudiante ? `la recuperación de ${datos.estudiante} en ${datos.asignatura ?? 'una asignatura'}` : `tu recuperación de ${datos.asignatura ?? 'una asignatura'}`;
      return {
        titulo: datos.superada ? 'Recuperación superada' : 'Recuperación registrada',
        mensaje: `Se registró ${de}: nota anterior ${nota(datos.nota_anterior)}, recuperación ${nota(datos.nota_nueva)}; ${datos.estudiante ? resultado : resultado.replace('le queda', 'te queda').replace('le quedan', 'te quedan')}.`,
      };
    }
    case 'SESION_COMISION_CONVOCADA':
      return {
        titulo: 'Sesión convocada',
        mensaje: `Has sido convocado(a) a la sesión de «${datos.nombre ?? 'Comisión'}»${datos.cuando ? ` el ${datos.cuando}` : ''}. Revisa el orden del día y participa.`,
      };
  }
}
