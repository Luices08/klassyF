import path from 'path';
import { describe, expect, it } from 'vitest';
import type { IIntentoEntrega } from '../src/models/activitySubmission.model';
import { depurarIntentos, type ResultadoBorrado } from '../src/services/purgaAlmacenamiento.service';
import { archivoDisponible, cumpleAntiguedad, interpretarArgumentosPurga, megabytes, rutaDentroDe } from '../src/utils/purgaAlmacenamiento';

const DIA = 86_400_000;
const finPeriodo = new Date('2026-06-01T00:00:00Z');
const dias = (n: number) => new Date(finPeriodo.getTime() + n * DIA);

describe('archivoDisponible', () => {
  it('solo cuenta lo que tiene ruta y no se ha depurado; los archivos de antes de la depuración no traen la bandera', () => {
    expect(archivoDisponible({ path: 'uploads/a.pdf' })).toBe(true);
    expect(archivoDisponible({ path: 'uploads/a.pdf', purgado: false })).toBe(true);
    expect(archivoDisponible({ path: null, purgado: true })).toBe(false);
    expect(archivoDisponible({ path: null })).toBe(false);
    expect(archivoDisponible({ path: 'uploads/a.pdf', purgado: true })).toBe(false);
  });
});

describe('cumpleAntiguedad', () => {
  it('cuenta los días desde el fin del periodo', () => {
    const entregado = new Date('2026-05-10T00:00:00Z');
    expect(cumpleAntiguedad(finPeriodo, entregado, dias(29), 30)).toBe(false);
    expect(cumpleAntiguedad(finPeriodo, entregado, dias(30), 30)).toBe(true);
  });

  it('una entrega posterior al fin del periodo espera sus propios días', () => {
    const tardia = dias(10);
    expect(cumpleAntiguedad(finPeriodo, tardia, dias(39), 30)).toBe(false);
    expect(cumpleAntiguedad(finPeriodo, tardia, dias(40), 30)).toBe(true);
  });

  it('con 0 días depura de inmediato; sin fecha de entrega manda el fin del periodo', () => {
    expect(cumpleAntiguedad(finPeriodo, null, dias(0), 0)).toBe(true);
    expect(cumpleAntiguedad(finPeriodo, undefined, dias(5), 30)).toBe(false);
  });
});

describe('rutaDentroDe', () => {
  const raiz = path.resolve('/srv/klassy/backend');
  const base = path.join(raiz, 'uploads', 'actividades');

  it('resuelve las rutas relativas al proceso que guarda la base', () => {
    expect(rutaDentroDe(base, 'uploads/actividades/abc/1.pdf', raiz)).toBe(path.join(base, 'abc', '1.pdf'));
  });

  it('rechaza lo que sale de la carpeta, también con ..', () => {
    expect(rutaDentroDe(base, 'uploads/actividades/../matriculas/x.pdf', raiz)).toBeNull();
    expect(rutaDentroDe(base, '../../etc/passwd', raiz)).toBeNull();
    expect(rutaDentroDe(base, '/etc/passwd', raiz)).toBeNull();
  });

  it('la carpeta misma o una hermana con el mismo prefijo no cuentan', () => {
    expect(rutaDentroDe(base, 'uploads/actividades', raiz)).toBeNull();
    expect(rutaDentroDe(base, 'uploads/actividades-otra/x.pdf', raiz)).toBeNull();
  });
});

describe('megabytes', () => {
  it('redondea a dos decimales', () => {
    expect(megabytes(0)).toBe(0);
    expect(megabytes(1024 * 1024)).toBe(1);
    expect(megabytes(1.5 * 1024 * 1024)).toBe(1.5);
    expect(megabytes(1234567)).toBe(1.18);
  });
});

describe('interpretarArgumentosPurga', () => {
  const id = '65f1a2b3c4d5e6f708192a3b';

  it('lee el periodo y los días; por defecto 30 y sin simular', () => {
    expect(interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays=45'])).toEqual({ periodoId: id, dias: 45, simular: false });
    expect(interpretarArgumentosPurga([`--periodoId=${id}`])).toEqual({ periodoId: id, dias: 30, simular: false });
    expect(interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays=0', '--dry-run'])).toEqual({ periodoId: id, dias: 0, simular: true });
  });

  it('exige un periodo válido y días enteros no negativos', () => {
    expect(() => interpretarArgumentosPurga([])).toThrow(/--periodoId/);
    expect(() => interpretarArgumentosPurga(['--periodoId=abc'])).toThrow(/--periodoId/);
    expect(() => interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays=-1'])).toThrow(/olderThanDays/);
    expect(() => interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays=3.5'])).toThrow(/olderThanDays/);
    expect(() => interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays='])).toThrow(/olderThanDays/);
    expect(() => interpretarArgumentosPurga([`--periodoId=${id}`, '--olderThanDays=abc'])).toThrow(/olderThanDays/);
  });
});

describe('depurarIntentos', () => {
  const ahora = dias(40);
  const archivo = (nombre: string, bytes = 100) => ({ path: `uploads/actividades/a1/${nombre}`, nombre, formato: 'PDF' as const, bytes });
  const intento = (numero: number, archivos: ReturnType<typeof archivo>[], fecha = dias(-5)): IIntentoEntrega => ({
    numero,
    texto_entrega: 'mi respuesta',
    respuesta_html: '',
    archivos,
    archivo_path: archivos[0]?.path ?? null,
    archivo_nombre: archivos[0]?.nombre ?? null,
    archivo_formato: archivos[0]?.formato ?? null,
    archivo_bytes: archivos[0]?.bytes ?? null,
    fecha_entrega: fecha,
    con_retraso: false,
    acceso_especial: false,
  });
  const opciones = (borrar: (ruta: string) => Promise<ResultadoBorrado>, diasEspera = 30) => ({ finPeriodo, ahora, dias: diasEspera, borrar });
  const siempreBorra = async (): Promise<ResultadoBorrado> => ({ tipo: 'borrado', bytes: 100 });

  it('marca cada archivo como depurado, anula la ruta y los espejos del intento, y conserva el resto', async () => {
    const r = await depurarIntentos([intento(1, [archivo('a.pdf'), archivo('b.pdf', 50)])], opciones(siempreBorra));

    expect(r).toMatchObject({ cambios: 2, borrados: 2, bytes: 200, ausentes: 0, recientes: 0, errores: [] });
    const [resultado] = r.intentos;
    expect(resultado).toMatchObject({ archivo_path: null, texto_entrega: 'mi respuesta', fecha_entrega: dias(-5), numero: 1 });
    expect(resultado!.archivos).toEqual([
      { path: null, nombre: 'a.pdf', formato: 'PDF', bytes: 100, purgado: true, fecha_purga: ahora },
      { path: null, nombre: 'b.pdf', formato: 'PDF', bytes: 50, purgado: true, fecha_purga: ahora },
    ]);
  });

  it('un archivo reciente se queda; el resto del mismo conjunto se depura aparte por intento', async () => {
    const r = await depurarIntentos([intento(1, [archivo('vieja.pdf')]), intento(2, [archivo('nueva.pdf')], dias(30))], opciones(siempreBorra));

    expect(r).toMatchObject({ cambios: 1, borrados: 1, recientes: 1 });
    expect(r.intentos[0]!.archivos[0]).toMatchObject({ path: null, purgado: true });
    expect(r.intentos[1]).toMatchObject({ archivo_path: 'uploads/actividades/a1/nueva.pdf' });
    expect(r.intentos[1]!.archivos[0]!.purgado).toBeUndefined();
  });

  it('un error deja el archivo como estaba para reintentarlo; lo ausente se marca sin contar bytes', async () => {
    const respuestas: Record<string, ResultadoBorrado> = {
      'uploads/actividades/a1/falla.pdf': { tipo: 'error', motivo: 'EACCES' },
      'uploads/actividades/a1/falta.pdf': { tipo: 'ausente' },
    };
    const r = await depurarIntentos([intento(1, [archivo('falla.pdf'), archivo('falta.pdf')])], opciones(async (ruta) => respuestas[ruta]!));

    expect(r).toMatchObject({ cambios: 1, borrados: 0, bytes: 0, ausentes: 1, errores: ['EACCES'] });
    const [resultado] = r.intentos;
    expect(resultado!.archivos[0]).toMatchObject({ path: 'uploads/actividades/a1/falla.pdf' });
    expect(resultado!.archivos[1]).toMatchObject({ path: null, purgado: true });
    // El espejo del intento pasa al primer archivo que sigue en disco.
    expect(resultado).toMatchObject({ archivo_path: 'uploads/actividades/a1/falla.pdf', archivo_nombre: 'falla.pdf' });
  });

  it('lo ya depurado no se vuelve a tocar', async () => {
    const borrar = async (): Promise<ResultadoBorrado> => {
      throw new Error('no debería borrar nada');
    };
    const yaDepurado = { path: null, nombre: 'a.pdf', formato: 'PDF' as const, bytes: 100, purgado: true, fecha_purga: dias(10) };
    const base = intento(1, []);
    const r = await depurarIntentos([{ ...base, archivos: [yaDepurado] }], opciones(borrar));

    expect(r).toMatchObject({ cambios: 0, borrados: 0, errores: [] });
    expect(r.intentos[0]!.archivos).toEqual([yaDepurado]);
  });

  it('una entrega anterior a los varios archivos (solo los campos archivo_*) también se depura', async () => {
    const vieja = intento(1, []);
    const r = await depurarIntentos(
      [{ ...vieja, archivo_path: 'uploads/actividades/a1/vieja.pdf', archivo_nombre: 'vieja.pdf', archivo_formato: 'PDF', archivo_bytes: 100 }],
      opciones(siempreBorra)
    );

    expect(r).toMatchObject({ cambios: 1, borrados: 1 });
    expect(r.intentos[0]).toMatchObject({ archivo_path: null });
    expect(r.intentos[0]!.archivos).toEqual([{ path: null, nombre: 'vieja.pdf', formato: 'PDF', bytes: 100, purgado: true, fecha_purga: ahora }]);
  });
});
