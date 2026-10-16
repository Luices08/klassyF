import { describe, expect, it } from 'vitest';
import { evaluarVentanaEntrega } from '../src/utils/actividades';
import { detectarAdjunto } from '../src/utils/adjuntosActividad';
import { normalizarVideo, sanitizarContenido, textoPlano, urlIncrustada } from '../src/utils/contenidoActividad';
import { analizarEntregas, camposModificados, intentoConsiderado, motivoSinEntrega, requiereElegirIntento } from '../src/utils/entregasActividad';

const plazos = {
  fecha_apertura: new Date('2026-03-01T12:00:00Z'),
  fecha_entrega: new Date('2026-03-10T12:00:00Z'),
  permite_entrega_tardia: false,
};
const despuesDelPlazo = new Date('2026-03-12T12:00:00Z');

describe('intentoConsiderado / requiereElegirIntento', () => {
  const intentos = [
    { numero: 1, fecha_entrega: new Date('2026-03-02T10:00:00Z') },
    { numero: 2, fecha_entrega: new Date('2026-03-03T10:00:00Z') },
    { numero: 3, fecha_entrega: new Date('2026-03-04T10:00:00Z') },
  ];

  it('sin intentos no hay nada que considerar', () => {
    expect(intentoConsiderado([], null)).toBeNull();
    expect(requiereElegirIntento([], null)).toBe(false);
  });

  it('sin elección cuenta el último', () => {
    expect(intentoConsiderado(intentos, null)?.numero).toBe(3);
  });

  it('con elección cuenta el elegido, aunque no sea el último', () => {
    expect(intentoConsiderado(intentos, 1)?.numero).toBe(1);
  });

  it('una elección que ya no existe no se reemplaza en silencio por otro intento', () => {
    expect(intentoConsiderado(intentos, 9)).toBeNull();
  });

  it('con un solo intento no hay que elegir; con varios y sin elección, sí', () => {
    expect(requiereElegirIntento(intentos.slice(0, 1), null)).toBe(false);
    expect(requiereElegirIntento(intentos, null)).toBe(true);
    expect(requiereElegirIntento(intentos, 2)).toBe(false);
  });
});

describe('evaluarVentanaEntrega con acceso especial', () => {
  it('vencida y sin entrega tardía no deja entregar', () => {
    const v = evaluarVentanaEntrega(plazos, despuesDelPlazo);
    expect(v.abierta).toBe(false);
    expect(v.acceso_especial).toBe(false);
  });

  it('el plazo personal abre la entrega y no la marca como tardía', () => {
    const v = evaluarVentanaEntrega(plazos, despuesDelPlazo, new Date('2026-03-15T12:00:00Z'));
    expect(v).toMatchObject({ abierta: true, tardia: false, acceso_especial: true });
  });

  it('pasado el plazo personal vuelve a cerrarse', () => {
    const v = evaluarVentanaEntrega(plazos, new Date('2026-03-16T12:00:00Z'), new Date('2026-03-15T12:00:00Z'));
    expect(v.abierta).toBe(false);
  });

  it('dentro del plazo normal el acceso especial no cambia nada', () => {
    const v = evaluarVentanaEntrega(plazos, new Date('2026-03-05T12:00:00Z'), new Date('2026-03-15T12:00:00Z'));
    expect(v).toMatchObject({ abierta: true, tardia: false, acceso_especial: false });
  });

  it('antes de publicarse no se abre ni con acceso especial', () => {
    const v = evaluarVentanaEntrega(plazos, new Date('2026-02-20T12:00:00Z'), new Date('2026-03-15T12:00:00Z'));
    expect(v.publicada).toBe(false);
    expect(v.abierta).toBe(false);
  });
});

describe('motivoSinEntrega', () => {
  const base = {
    requiere_entrega: true,
    cerrada: false,
    estado: 'PROGRAMADA' as const,
    intentos: 0,
    permite_multiples_entregas: false,
    motivo_periodo: null,
    ventana: evaluarVentanaEntrega(plazos, new Date('2026-03-05T12:00:00Z')),
  };

  it('puede entregar cuando todo está en orden', () => {
    expect(motivoSinEntrega(base)).toBeNull();
  });

  it('una actividad de aula no recibe entregas', () => {
    expect(motivoSinEntrega({ ...base, requiere_entrega: false })).toMatch(/no recibe entregas digitales/);
  });

  it('calificada no admite más entregas', () => {
    expect(motivoSinEntrega({ ...base, estado: 'CALIFICADA', intentos: 1 })).toMatch(/calificada/);
  });

  it('solo una entrega salvo que se permitan varias', () => {
    expect(motivoSinEntrega({ ...base, estado: 'ENTREGADA', intentos: 1 })).toMatch(/Solo se permite una entrega/);
    expect(motivoSinEntrega({ ...base, estado: 'ENTREGADA', intentos: 1, permite_multiples_entregas: true })).toBeNull();
  });

  it('con entregas múltiples hay un máximo', () => {
    expect(motivoSinEntrega({ ...base, estado: 'ENTREGADA', intentos: 10, permite_multiples_entregas: true })).toMatch(/máximo/);
  });

  it('un periodo cerrado manda sobre todo, también sobre el acceso especial', () => {
    const ventana = evaluarVentanaEntrega(plazos, despuesDelPlazo, new Date('2026-03-15T12:00:00Z'));
    expect(motivoSinEntrega({ ...base, ventana, motivo_periodo: 'El periodo 1 está cerrado.' })).toBe('El periodo 1 está cerrado.');
  });

  it('cerrada a mano frena a todos menos a quien tiene acceso especial', () => {
    expect(motivoSinEntrega({ ...base, cerrada: true })).toMatch(/cerró/);
    const ventana = evaluarVentanaEntrega(plazos, despuesDelPlazo, new Date('2026-03-15T12:00:00Z'));
    expect(motivoSinEntrega({ ...base, cerrada: true, ventana })).toBeNull();
  });

  it('vencida sin acceso especial dice el motivo de la ventana', () => {
    const ventana = evaluarVentanaEntrega(plazos, despuesDelPlazo);
    expect(motivoSinEntrega({ ...base, ventana })).toMatch(/venció/);
  });
});

describe('analizarEntregas', () => {
  const fila = (nota: number | null, extra: Partial<Parameters<typeof analizarEntregas>[0][number]> = {}) => ({
    entrego: nota !== null,
    estado: nota !== null ? ('CALIFICADA' as const) : ('PROGRAMADA' as const),
    nota,
    con_retraso: false,
    intentos: nota !== null ? 1 : 0,
    ...extra,
  });

  it('un grupo sin estudiantes no divide por cero', () => {
    const a = analizarEntregas([], null);
    expect(a).toMatchObject({ total_estudiantes: 0, porcentaje_entrega: 0, porcentaje_calificado: 0, notas: null });
  });

  it('cuenta entregas, retrasos, varios intentos y trabajo por calificar', () => {
    const a = analizarEntregas(
      [
        fila(4.5),
        fila(2),
        fila(null),
        fila(null, { entrego: true, estado: 'ENTREGADA', intentos: 2, con_retraso: true }),
      ],
      null
    );
    expect(a).toMatchObject({
      total_estudiantes: 4,
      entregaron: 3,
      sin_entregar: 1,
      con_retraso: 1,
      con_varios_intentos: 1,
      calificados: 2,
      por_calificar: 1,
      porcentaje_entrega: 75,
      porcentaje_calificado: 50,
    });
  });

  it('promedio, mediana y quiénes aprueban salen de las notas puestas', () => {
    const a = analizarEntregas([fila(5), fila(4), fila(2), fila(1)], null);
    expect(a.notas).toMatchObject({ promedio: 3, mediana: 3, minima: 1, maxima: 5 });
    expect(a.notas?.aprueban).toBe(2);
    expect(a.notas?.pierden).toBe(2);
    expect(a.notas?.porcentaje_aprueban).toBe(50);
  });

  it('la distribución reparte cada nota en un nivel de la escala', () => {
    const a = analizarEntregas([fila(5), fila(4.7), fila(1)], null);
    expect(a.distribucion.reduce((suma, n) => suma + n.cantidad, 0)).toBe(3);
    expect(a.distribucion.some((n) => n.cantidad === 2)).toBe(true);
  });

  it('una nota baja es una nota, no "falta nota"', () => {
    const a = analizarEntregas([fila(1)], null);
    expect(a.calificados).toBe(1);
    expect(a.notas?.pierden).toBe(1);
  });

  it('una nota fuera de la escala no rompe el análisis', () => {
    const a = analizarEntregas([fila(0), fila(7)], null);
    expect(a.distribucion.reduce((suma, n) => suma + n.cantidad, 0)).toBe(2);
  });
});

describe('camposModificados', () => {
  it('traduce a lo que ve el estudiante, sin repetir y sin campos desconocidos', () => {
    expect(camposModificados(['fecha_entrega', 'contenido_html', 'descripcion', 'secreto'])).toEqual(['la fecha límite', 'la descripción']);
  });
});

describe('sanitizarContenido', () => {
  it('quita scripts, manejadores de eventos y estilos', () => {
    const limpio = sanitizarContenido('<p onclick="x()">Hola</p><script>alert(1)</script><span style="color:red">a</span>');
    expect(limpio).not.toMatch(/script|onclick|style/);
    expect(limpio).toContain('Hola');
  });

  it('solo deja imágenes pegadas como data URI de imagen', () => {
    const pixel = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizarContenido(`<img src="${pixel}">`)).toContain(pixel);
    expect(sanitizarContenido('<img src="https://ejemplo.com/a.png">')).not.toContain('img');
    expect(sanitizarContenido('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('img');
    expect(sanitizarContenido('<img src="javascript:alert(1)">')).not.toContain('img');
  });

  it('los enlaces se abren aparte y sin referrer', () => {
    expect(sanitizarContenido('<a href="https://ejemplo.com">x</a>')).toMatch(/target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/);
    expect(sanitizarContenido('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
  });

  it('rechaza un contenido enorme', () => {
    expect(() => sanitizarContenido(`<p>${'a'.repeat(5 * 1024 * 1024)}</p>`)).toThrow(/demasiado grande/);
  });

  it('textoPlano deja solo el texto', () => {
    expect(textoPlano('<p>Hola&nbsp;<strong>mundo</strong></p><p>otra</p>')).toBe('Hola mundo otra');
  });
});

describe('normalizarVideo', () => {
  it('entiende los formatos de enlace de YouTube', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(normalizarVideo(url)).toEqual({ proveedor: 'YOUTUBE', video_id: 'dQw4w9WgXcQ' });
    }
  });

  it('entiende Vimeo', () => {
    expect(normalizarVideo('https://vimeo.com/123456789')).toEqual({ proveedor: 'VIMEO', video_id: '123456789' });
    expect(normalizarVideo('https://player.vimeo.com/video/123456789')).toEqual({ proveedor: 'VIMEO', video_id: '123456789' });
  });

  it('rechaza otros sitios, otros esquemas y basura', () => {
    expect(normalizarVideo('https://ejemplo.com/video.mp4')).toBeNull();
    expect(normalizarVideo('javascript:alert(1)')).toBeNull();
    expect(normalizarVideo('no es un enlace')).toBeNull();
    expect(normalizarVideo('https://www.youtube.com/watch?v=corto')).toBeNull();
    expect(normalizarVideo('https://youtube.com.malo.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('la dirección que se incrusta es siempre del proveedor', () => {
    expect(urlIncrustada({ proveedor: 'YOUTUBE', video_id: 'dQw4w9WgXcQ' })).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(urlIncrustada({ proveedor: 'VIMEO', video_id: '123456789' })).toBe('https://player.vimeo.com/video/123456789');
  });
});

describe('detectarAdjunto', () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]);

  it('reconoce MP4 y MP3 por sus bytes', () => {
    expect(detectarAdjunto('video/mp4', 'clase.mp4', mp4)).toMatchObject({ tipo: 'VIDEO', ext: '.mp4' });
    expect(detectarAdjunto('audio/mpeg', 'clase.mp3', mp3)).toMatchObject({ tipo: 'AUDIO', ext: '.mp3' });
  });

  it('no se deja engañar por un nombre o tipo falsos', () => {
    expect(detectarAdjunto('video/mp4', 'clase.mp4', Buffer.from('esto no es un video'))).toBeNull();
    expect(detectarAdjunto('audio/mpeg', 'clase.mp3', mp4)).toBeNull();
    expect(detectarAdjunto('application/x-msdownload', 'virus.exe', Buffer.from('MZ'))).toBeNull();
  });

  it('sigue aceptando lo que ya aceptaban las evidencias', () => {
    expect(detectarAdjunto('application/pdf', 'guia.pdf', Buffer.from('%PDF-1.7\n'))).toMatchObject({ tipo: 'PDF', ext: '.pdf' });
  });
});
