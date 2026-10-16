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
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Título y texto de una alerta según cuántas se acumularon. Pura: la usa el servidor al leer y las pruebas. */
export function renderizarNotificacion(evento: EventoNotificacion, contador: number, datos: DatosNotificacion = {}): { titulo: string; mensaje: string } {
  const n = Math.max(1, contador);
  switch (evento) {
    case 'ENTREGA_NUEVA':
      return {
        titulo: 'Entregas nuevas',
        mensaje: `Tienes ${n} ${plural(n, 'entrega nueva', 'entregas nuevas')} en la actividad «${datos.actividad ?? 'sin nombre'}».`,
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
    case 'CIERRE_PERIODO_PROXIMO':
      return {
        titulo: 'Cierre de periodo',
        mensaje: `El periodo ${datos.periodo ?? ''} cierra ${datos.dias === 0 ? 'hoy' : `en ${datos.dias ?? '?'} ${plural(datos.dias ?? 0, 'día', 'días')}`}. Revisa que tus notas estén completas.`,
      };
  }
}
