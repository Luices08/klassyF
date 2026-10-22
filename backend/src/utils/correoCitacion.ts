import { NOMBRES_MOTIVO_CITACION, MotivoCitacion, TipoCorreo } from '../constants/citaciones';
import { NOMBRES_ROL_CORREO } from './nombresRol';

export interface DatosCorreoCitacion {
  tipo: TipoCorreo;
  institucion: string;
  acudiente: string;
  /** Nombre de pila del estudiante. */
  estudiante: string;
  titulo: string;
  motivo: MotivoCitacion;
  /** Vacía si no debe viajar (citación particular). */
  descripcion: string;
  fecha_hora: Date;
  lugar: string;
  convocante: string;
  convocante_rol: string;
  /** Enlace de confirmación; null en un aviso de cancelación. */
  enlace: string | null;
  motivo_cancelacion?: string;
}

export const escapar = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Fecha y hora en hora de Colombia, sin depender de la zona del servidor. */
export function fechaLegible(fecha: Date): { dia: string; hora: string } {
  const dia = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
  const hora = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true }).format(fecha).replace(/[\u202f\u00a0]/g, ' ');
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), hora };
}

export const nombreDeRolParaCorreo = (rol: string): string => NOMBRES_ROL_CORREO[rol] ?? 'Institución';

/** Asunto, texto plano y HTML del correo. Pura: el HTML escapa todo lo que escribe una persona. */
export function armarCorreoCitacion(d: DatosCorreoCitacion): { asunto: string; texto: string; html: string } {
  const { dia, hora } = fechaLegible(d.fecha_hora);
  const motivo = NOMBRES_MOTIVO_CITACION[d.motivo];
  const cancelada = d.tipo === 'CITACION_CANCELADA';
  const actualizada = d.tipo === 'CITACION_ACTUALIZADA';

  const asunto = cancelada ? `Citación cancelada: ${d.titulo}` : actualizada ? `Citación reprogramada: ${d.titulo}` : `Citación: ${d.titulo}`;
  const intro = cancelada
    ? `La siguiente citación de ${d.estudiante} fue cancelada.`
    : actualizada
      ? `Cambiaron los datos de la citación de ${d.estudiante}. Confirma de nuevo tu asistencia.`
      : `Te invitamos a una reunión relacionada con ${d.estudiante}.`;

  const lineas: Array<[string, string]> = [
    ['Motivo', motivo],
    ['Fecha', dia],
    ['Hora', hora],
    ['Lugar', d.lugar],
    ['Convoca', `${d.convocante} (${d.convocante_rol})`],
  ];

  const texto = [
    `Hola ${d.acudiente},`,
    '',
    intro,
    '',
    d.titulo,
    ...lineas.map(([k, v]) => `${k}: ${v}`),
    ...(d.descripcion ? ['', d.descripcion] : []),
    ...(cancelada && d.motivo_cancelacion ? ['', `Motivo de la cancelación: ${d.motivo_cancelacion}`] : []),
    ...(d.enlace ? ['', 'Confirma si asistirás en este enlace:', d.enlace] : []),
    '',
    d.institucion,
  ].join('\n');

  const filas = lineas
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#788794;font-size:13px;vertical-align:top">${escapar(k)}</td><td style="padding:6px 0;color:#172235;font-size:15px;font-weight:600">${escapar(v)}</td></tr>`)
    .join('');

  const boton = d.enlace
    ? `<p style="margin:24px 0"><a href="${escapar(d.enlace)}" style="background:#2878EA;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;display:inline-block">Confirmar asistencia</a></p><p style="color:#788794;font-size:12px">Si el botón no abre, copia este enlace en tu navegador:<br>${escapar(d.enlace)}</p>`
    : '';

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F1F5F9;font-family:'Plus Jakarta Sans',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#FFFFFF;border:1px solid #DDE4EC;border-radius:16px;padding:28px">
<p style="color:#3F4D61;font-size:15px;margin:0 0 12px">Hola ${escapar(d.acudiente)},</p>
<p style="color:#3F4D61;font-size:15px;margin:0 0 16px">${escapar(intro)}</p>
<h1 style="color:${cancelada ? '#EF5350' : '#172235'};font-size:20px;margin:0 0 12px">${escapar(d.titulo)}</h1>
<table role="presentation" style="border-collapse:collapse">${filas}</table>
${d.descripcion ? `<p style="color:#3F4D61;font-size:15px;white-space:pre-line">${escapar(d.descripcion)}</p>` : ''}
${cancelada && d.motivo_cancelacion ? `<p style="color:#3F4D61;font-size:15px">Motivo de la cancelación: ${escapar(d.motivo_cancelacion)}</p>` : ''}
${boton}
</div>
<p style="color:#788794;font-size:12px;text-align:center;margin-top:16px">${escapar(d.institucion)}</p>
</div></body></html>`;

  return { asunto, texto, html };
}
