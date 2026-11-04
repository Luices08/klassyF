import { escapar } from './correoCitacion';

export interface DatosCorreoAdmision {
  tipo: 'ADMISION_ADMITIDA' | 'ADMISION_MATRICULADA';
  institucion: string;
  acudiente: string;
  /** Nombre completo del aspirante. */
  estudiante: string;
  grado: string;
  anio: number | null;
  /** Solo en la matrícula. */
  matricula?: {
    grupo: string;
    sede: string;
    jornada: string;
    folio: string | null;
    condicional: boolean;
    fecha_limite_documentos: Date | null;
  };
  /** Enlace al login del portal; null si el acudiente aún no tiene cuenta. */
  enlace_portal: string | null;
  /** Página pública del colegio, para consultar el estado de la solicitud. */
  enlace_publico: string;
}

const fechaCorta = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);

/** Asunto, texto plano y HTML del aviso de admisión o matrícula al acudiente. Pura: el HTML escapa todo lo que escribe una persona. */
export function armarCorreoAdmision(d: DatosCorreoAdmision): { asunto: string; texto: string; html: string } {
  const matriculado = d.tipo === 'ADMISION_MATRICULADA';
  const anio = d.anio ? ` para el año lectivo ${d.anio}` : '';

  const asunto = matriculado ? `Matrícula formalizada: ${d.estudiante}` : `Solicitud de admisión aceptada: ${d.estudiante}`;
  const intro = matriculado
    ? `La matrícula de ${d.estudiante} en ${d.institucion} quedó formalizada${anio}.`
    : `La solicitud de admisión de ${d.estudiante} a grado ${d.grado}${anio} fue aceptada. La secretaría te indicará cuándo y cómo formalizar la matrícula.`;

  const lineas: Array<[string, string]> = [['Grado', d.grado]];
  if (d.matricula) {
    const m = d.matricula;
    lineas.push(['Grupo', m.grupo], ['Sede', m.sede], ['Jornada', m.jornada]);
    if (m.folio) lineas.push(['Folio', m.folio]);
    lineas.push(['Estado', m.condicional ? 'Matrícula condicional' : 'Matrícula definitiva']);
  }

  const notas: string[] = [];
  if (d.matricula?.condicional) {
    notas.push(
      d.matricula.fecha_limite_documentos
        ? `Quedan documentos por entregar. El plazo del acta de compromiso vence el ${fechaCorta(d.matricula.fecha_limite_documentos)}.`
        : 'Quedan documentos por entregar en la secretaría.'
    );
  }
  if (d.enlace_portal) notas.push('Ya puedes ingresar al portal de acudientes con tu número de documento. Al entrar por primera vez el sistema te pedirá cambiar la contraseña.');

  const enlace = d.enlace_portal ?? d.enlace_publico;
  const textoBoton = d.enlace_portal ? 'Ingresar al portal' : 'Consultar la solicitud';

  const texto = [
    `Hola ${d.acudiente},`,
    '',
    intro,
    '',
    ...lineas.map(([k, v]) => `${k}: ${v}`),
    ...(notas.length ? ['', ...notas] : []),
    '',
    `${textoBoton}: ${enlace}`,
    '',
    d.institucion,
  ].join('\n');

  const filas = lineas
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#788794;font-size:13px;vertical-align:top">${escapar(k)}</td><td style="padding:6px 0;color:#172235;font-size:15px;font-weight:600">${escapar(v)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F1F5F9;font-family:'Plus Jakarta Sans',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#FFFFFF;border:1px solid #DDE4EC;border-radius:16px;padding:28px">
<p style="color:#3F4D61;font-size:15px;margin:0 0 12px">Hola ${escapar(d.acudiente)},</p>
<p style="color:#3F4D61;font-size:15px;margin:0 0 16px">${escapar(intro)}</p>
<h1 style="color:#1FAF73;font-size:20px;margin:0 0 12px">${escapar(d.estudiante)}</h1>
<table role="presentation" style="border-collapse:collapse">${filas}</table>
${notas.map((n) => `<p style="color:#3F4D61;font-size:15px">${escapar(n)}</p>`).join('')}
<p style="margin:24px 0"><a href="${escapar(enlace)}" style="background:#2878EA;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;display:inline-block">${escapar(textoBoton)}</a></p>
<p style="color:#788794;font-size:12px">Si el botón no abre, copia este enlace en tu navegador:<br>${escapar(enlace)}</p>
</div>
<p style="color:#788794;font-size:12px;text-align:center;margin-top:16px">${escapar(d.institucion)}</p>
</div></body></html>`;

  return { asunto, texto, html };
}
