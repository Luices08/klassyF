import { env } from '../config/env';
import Citacion from '../models/citacion.model';
import CitacionDestinatario from '../models/citacionDestinatario.model';
import { CorreoEnColaDocument } from '../models/correoEnCola.model';
import Guardian from '../models/guardian.model';
import Institution from '../models/institution.model';
import User from '../models/user.model';
import { descripcionViajaPorCorreo } from '../utils/citaciones';
import { armarCorreoCitacion, nombreDeRolParaCorreo } from '../utils/correoCitacion';
import { MensajeCorreo } from './correo.service';

export type ResultadoArmado = { mensaje: MensajeCorreo } | { omitir: string };

/**
 * Arma el correo de una citación con los datos de AHORA, no los del momento en que se encoló. Si ya no tiene sentido enviarlo (la
 * citación se canceló, pasó, o hay un correo más reciente para ese acudiente) devuelve `omitir` y el envío se salta sin contar como fallo.
 */
export async function armarMensajeDeCitacion(correo: CorreoEnColaDocument): Promise<ResultadoArmado> {
  const destinatario = await CitacionDestinatario.findById(correo.referencia_id);
  if (!destinatario) return { omitir: 'El acudiente ya no está en la citación.' };
  // Un correo más reciente (reprogramación, cancelación o reenvío) reemplaza a este.
  if (String(destinatario.correo_id) !== String(correo._id)) return { omitir: 'Lo reemplazó un correo más reciente.' };

  const citacion = await Citacion.findById(destinatario.citacion_id);
  if (!citacion) return { omitir: 'La citación ya no existe.' };

  const cancelacion = correo.tipo === 'CITACION_CANCELADA';
  if (cancelacion && citacion.estado !== 'CANCELADA') return { omitir: 'La citación ya no está cancelada.' };
  if (!cancelacion && citacion.estado !== 'PROGRAMADA') return { omitir: 'La citación ya no está programada.' };
  if (!cancelacion && citacion.fecha_hora.getTime() <= Date.now()) return { omitir: 'La reunión ya pasó.' };

  const [acudiente, estudiante, convocante, institucion] = await Promise.all([
    Guardian.findById(destinatario.guardian_id).select('nombre apellido').lean(),
    User.findById(destinatario.student_id).select('nombre').lean(),
    User.findById(citacion.convocante_id).select('nombre apellido').lean(),
    Institution.findOne().select('nombre').lean(),
  ]);

  const armado = armarCorreoCitacion({
    tipo: correo.tipo,
    institucion: institucion?.nombre ?? 'Institución educativa',
    acudiente: acudiente ? `${acudiente.nombre} ${acudiente.apellido}` : 'acudiente',
    estudiante: estudiante?.nombre ?? 'tu acudido',
    titulo: citacion.titulo,
    motivo: citacion.motivo,
    descripcion: descripcionViajaPorCorreo(citacion.tipo) ? citacion.descripcion : '',
    fecha_hora: citacion.fecha_hora,
    lugar: citacion.lugar,
    convocante: convocante ? `${convocante.nombre} ${convocante.apellido}` : 'La institución',
    convocante_rol: nombreDeRolParaCorreo(citacion.convocante_rol),
    enlace: cancelacion ? null : `${env.urlPublica}/citacion/${destinatario.token}`,
    motivo_cancelacion: citacion.cancelacion?.motivo,
  });

  return { mensaje: { para: correo.para, asunto: armado.asunto, texto: armado.texto, html: armado.html } };
}
