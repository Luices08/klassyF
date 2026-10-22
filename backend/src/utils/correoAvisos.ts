import { escapar } from './correoCitacion';

// Correos a la familia que no son una citación: boletín publicado e inasistencias sin excusa. Funciones puras; el HTML escapa todo lo que escribe una persona.

interface Base {
  institucion: string;
  acudiente: string;
  /** Nombre de pila del estudiante. */
  estudiante: string;
  /** Dirección del portal; null si el servidor no tiene `PUBLIC_URL`. */
  enlace: string | null;
}

export interface DatosCorreoBoletin extends Base {
  periodo: number;
}

export interface DatosCorreoInasistencia extends Base {
  /** Día de las inasistencias, ya en palabras (p. ej. «Martes, 3 de marzo de 2026»). */
  dia: string;
  asignaturas: string[];
}

interface Armado {
  asunto: string;
  texto: string;
  html: string;
}

function plantilla(d: Base, titulo: string, parrafos: string[], lista: string[] = [], cierre: string[] = []): { texto: string; html: string } {
  const texto = [
    `Hola ${d.acudiente},`,
    '',
    ...parrafos,
    ...(lista.length > 0 ? ['', ...lista.map((l) => `- ${l}`)] : []),
    ...(cierre.length > 0 ? ['', ...cierre] : []),
    ...(d.enlace ? ['', 'Ingresa al portal con el documento de identidad:', d.enlace] : []),
    '',
    d.institucion,
  ].join('\n');

  const boton = d.enlace
    ? `<p style="margin:24px 0"><a href="${escapar(d.enlace)}" style="background:#2878EA;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;display:inline-block">Ir al portal</a></p><p style="color:#788794;font-size:12px">Si el botón no abre, copia este enlace en tu navegador:<br>${escapar(d.enlace)}</p>`
    : '';
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F1F5F9;font-family:'Plus Jakarta Sans',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#FFFFFF;border:1px solid #DDE4EC;border-radius:16px;padding:28px">
<p style="color:#3F4D61;font-size:15px;margin:0 0 12px">Hola ${escapar(d.acudiente)},</p>
<h1 style="color:#172235;font-size:20px;margin:0 0 12px">${escapar(titulo)}</h1>
${parrafos.map((p) => `<p style="color:#3F4D61;font-size:15px;margin:0 0 12px">${escapar(p)}</p>`).join('\n')}
${lista.length > 0 ? `<ul style="color:#172235;font-size:15px;font-weight:600;margin:0 0 12px;padding-left:20px">${lista.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>` : ''}
${cierre.map((p) => `<p style="color:#3F4D61;font-size:15px;margin:0 0 12px">${escapar(p)}</p>`).join('\n')}
${boton}
</div>
<p style="color:#788794;font-size:12px;text-align:center;margin-top:16px">${escapar(d.institucion)}</p>
</div></body></html>`;
  return { texto, html };
}

export function armarCorreoBoletin(d: DatosCorreoBoletin): Armado {
  const titulo = `Boletín del periodo ${d.periodo} disponible`;
  const cuerpo = plantilla(d, titulo, [`El boletín del periodo ${d.periodo} de ${d.estudiante} ya está publicado y puede consultarse en el portal.`]);
  return { asunto: `${titulo}: ${d.estudiante}`, ...cuerpo };
}

export function armarCorreoInasistencia(d: DatosCorreoInasistencia): Armado {
  const titulo = `Inasistencia sin excusa de ${d.estudiante}`;
  const cuerpo = plantilla(
    d,
    titulo,
    [`${d.estudiante} no asistió el ${d.dia} a:`],
    d.asignaturas,
    ['Si hay una excusa válida, comunícala a la institución para que quede justificada.']
  );
  return { asunto: titulo, ...cuerpo };
}
