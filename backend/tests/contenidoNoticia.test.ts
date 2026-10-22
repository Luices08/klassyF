import { describe, expect, it } from 'vitest';
import { resolverContenidoNoticia, sanitizarContenidoNoticia } from '../src/utils/contenidoNoticia';
import { decodificarPortada } from '../src/utils/portadaNoticia';

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('sanitizarContenidoNoticia', () => {
  it('deja pasar la letra capital, las citas y el formato de siempre', () => {
    const html = '<p class="letra-capital">Hola <strong>mundo</strong></p><blockquote>cita</blockquote><ul><li>uno</li></ul><h2>Título</h2>';
    expect(sanitizarContenidoNoticia(html)).toBe(html);
  });

  it('solo acepta la clase de la letra capital, y solo en un párrafo', () => {
    expect(sanitizarContenidoNoticia('<p class="letra-capital otra">a</p>')).toBe('<p class="letra-capital">a</p>');
    expect(sanitizarContenidoNoticia('<p class="otra">a</p>')).toBe('<p>a</p>');
    expect(sanitizarContenidoNoticia('<h2 class="letra-capital">a</h2>')).toBe('<h2>a</h2>');
    expect(sanitizarContenidoNoticia('<blockquote class="letra-capital">a</blockquote>')).toBe('<blockquote>a</blockquote>');
  });

  it('quita scripts, estilos, manejadores de eventos y enlaces peligrosos', () => {
    const limpio = sanitizarContenidoNoticia('<p style="color:red" onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src="https://malo.example"></iframe>');
    for (const peligro of ['style', 'onclick', 'script', 'javascript:', 'iframe', 'malo.example']) expect(limpio, peligro).not.toContain(peligro);
  });

  it('las imágenes solo pasan como data URI de imagen', () => {
    expect(sanitizarContenidoNoticia(`<img src="${PNG_1X1}" alt="x">`)).toContain('<img');
    expect(sanitizarContenidoNoticia('<img src="https://malo.example/x.png">')).not.toContain('img');
    expect(sanitizarContenidoNoticia('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('img');
  });

  it('rechaza un cuerpo demasiado grande', () => {
    const enorme = `<p>${'a'.repeat(5 * 1024 * 1024)}</p>`;
    expect(() => sanitizarContenidoNoticia(enorme)).toThrow(/demasiado grande|supera 2 MB/);
  });
});

describe('resolverContenidoNoticia', () => {
  it('de un cuerpo con formato saca el HTML limpio y la descripción sin formato', () => {
    const r = resolverContenidoNoticia({ contenido_html: '<p class="letra-capital">Proyectos de <strong>ciencias</strong>.</p><blockquote>La ciencia es de todos</blockquote>' });
    expect(r.contenido_html).toBe('<p class="letra-capital">Proyectos de <strong>ciencias</strong>.</p><blockquote>La ciencia es de todos</blockquote>');
    expect(r.descripcion).toBe('Proyectos de ciencias. La ciencia es de todos');
  });

  it('con solo texto (la forma anterior) conserva la descripción y no inventa formato', () => {
    expect(resolverContenidoNoticia({ descripcion: '  Reunión general en el coliseo.  ' })).toEqual({ descripcion: 'Reunión general en el coliseo.', contenido_html: '' });
  });

  it('el cuerpo con formato manda sobre la descripción', () => {
    expect(resolverContenidoNoticia({ descripcion: 'viejo', contenido_html: '<p>nuevo</p>' }).descripcion).toBe('nuevo');
  });

  it('exige que haya algo escrito', () => {
    expect(() => resolverContenidoNoticia({})).toThrow(/cuerpo/);
    expect(() => resolverContenidoNoticia({ contenido_html: '<p>   </p>' })).toThrow(/cuerpo/);
    expect(() => resolverContenidoNoticia({ descripcion: '   ' })).toThrow(/cuerpo/);
  });

  it('un cuerpo que es solo una imagen sigue siendo un cuerpo', () => {
    const r = resolverContenidoNoticia({ contenido_html: `<img src="${PNG_1X1}" alt="afiche">` });
    expect(r.descripcion).toBe('Ver el contenido de la noticia.');
  });

  it('la descripción de los listados no pasa del máximo', () => {
    expect(resolverContenidoNoticia({ contenido_html: `<p>${'palabra '.repeat(2000)}</p>` }).descripcion.length).toBeLessThanOrEqual(4000);
  });
});

describe('decodificarPortada', () => {
  it('decodifica un PNG verdadero', () => {
    const portada = decodificarPortada(PNG_1X1);
    expect(portada.mime).toBe('image/png');
    expect(portada.datos.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('no cree lo que declara el navegador: mira la firma de bytes', () => {
    expect(() => decodificarPortada('data:image/png;base64,AAAAAAAAAAAAAAAA')).toThrow(/PNG, JPG o WEBP válido/);
    expect(() => decodificarPortada('data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).toThrow(/válido/);
  });

  it('rechaza lo que no es una imagen admitida', () => {
    expect(() => decodificarPortada('data:application/pdf;base64,AAAA')).toThrow(/PNG, JPG o WEBP/);
    expect(() => decodificarPortada('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toThrow(/PNG, JPG o WEBP/);
    expect(() => decodificarPortada('https://malo.example/x.png')).toThrow(/PNG, JPG o WEBP/);
    expect(() => decodificarPortada('')).toThrow(/PNG, JPG o WEBP/);
  });

  it('rechaza una portada que pesa más de 2 MB', () => {
    const cabecera = Buffer.from('89504e470d0a1a0a', 'hex');
    const grande = Buffer.concat([cabecera, Buffer.alloc(2 * 1024 * 1024 + 10)]);
    expect(() => decodificarPortada(`data:image/png;base64,${grande.toString('base64')}`)).toThrow(/2 MB/);
  });
});
