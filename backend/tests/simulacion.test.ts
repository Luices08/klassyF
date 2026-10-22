import path from 'path';
import { describe, expect, it } from 'vitest';
import { cargarConfiguracion, planDeGrado } from '../scripts/simulacion/configuracion';
import { asignarCarga } from '../scripts/simulacion/logica/asignadorCarga';
import { categoriasDelGrado, cholesky, fechaNacimiento, generarEstudiante } from '../scripts/simulacion/logica/perfiles';
import { azarPara } from '../scripts/simulacion/nucleo/azar';
import { festivosColombia, isoDia, pascua, semanaSanta } from '../scripts/simulacion/nucleo/fechas';

const config = cargarConfiguracion(path.join(__dirname, '../scripts/simulacion/config/colegio-pequeno.json'));
const grupos = config.grupos.flatMap((g) => g.nomenclaturas.map((clave) => ({ clave, grado: g.grado, sede: g.sede })));

describe('simulación: azar con semilla', () => {
  it('la misma semilla y claves dan la misma secuencia, y otra clave otra', () => {
    const a = azarPara(7, 'x', 1);
    const b = azarPara(7, 'x', 1);
    const c = azarPara(7, 'x', 2);
    const serie = (r: ReturnType<typeof azarPara>) => Array.from({ length: 5 }, () => r.num());
    expect(serie(a)).toEqual(serie(b));
    expect(serie(azarPara(7, 'x', 1))).not.toEqual(serie(c));
  });
});

describe('simulación: calendario colombiano', () => {
  it('calcula la Pascua y los festivos trasladados a lunes de 2024', () => {
    expect(isoDia(pascua(2024))).toBe('2024-03-31');
    const fechas = festivosColombia(2024).map((f) => isoDia(f.fecha));
    for (const f of ['2024-01-08', '2024-03-25', '2024-03-28', '2024-03-29', '2024-05-13', '2024-06-03', '2024-06-10', '2024-07-01', '2024-08-19', '2024-10-14', '2024-11-04', '2024-11-11']) {
      expect(fechas).toContain(f);
    }
    expect(isoDia(semanaSanta(2024).inicio)).toBe('2024-03-25');
  });
});

describe('simulación: reparto de carga docente', () => {
  const carga = asignarCarga(grupos, (g) => planDeGrado(config, g).asignaturas, config.docentes.plazas, config.docentes.horas_min, config.docentes.horas_max);

  it('cubre todas las horas del plan y deja a cada docente entre el mínimo y el máximo', () => {
    const horasPlan = grupos.reduce((s, g) => s + Object.values(planDeGrado(config, g.grado).asignaturas).reduce((x, h) => x + h, 0), 0);
    expect(carga.asignaciones.reduce((s, a) => s + a.horas, 0)).toBe(horasPlan);
    for (const h of carga.horas.values()) {
      expect(h).toBeGreaterThanOrEqual(config.docentes.horas_min);
      expect(h).toBeLessThanOrEqual(config.docentes.horas_max);
    }
  });

  it('cada grupo tiene un director distinto y el técnico dicta toda la media técnica', () => {
    expect(new Set(carga.directores.values()).size).toBe(grupos.length);
    const tecnica = carga.asignaciones.filter((a) => ['PROG', 'BD', 'PROY', 'WEB', 'PPR'].includes(a.asignatura));
    expect(tecnica.every((a) => a.docente === 'TECNICO')).toBe(true);
  });
});

describe('simulación: perfiles de estudiantes', () => {
  it('reparte las categorías del grado con la proporción exacta de la matriz', () => {
    const lista = categoriasDelGrado(config, 6, 20, azarPara(1, 'g6'));
    const pesos = config.poblacion.por_grado['6'] as number[];
    config.poblacion.categorias.forEach((c, i) => {
      const esperado = (pesos[i] as number) * 20;
      expect(Math.abs(lista.filter((x) => x === c).length - esperado)).toBeLessThan(1);
    });
  });

  it('genera latentes dentro de sus rangos y una fecha de nacimiento con la edad pedida', () => {
    const azar = azarPara(3, 'est');
    for (let i = 0; i < 200; i += 1) {
      const e = generarEstudiante(config, 9, 'BAJO', azar);
      expect(e.latentes.habilidad).toBeGreaterThanOrEqual(1.2);
      expect(e.latentes.habilidad).toBeLessThanOrEqual(5);
      expect(e.latentes.constancia).toBeGreaterThan(0);
      expect(e.latentes.constancia).toBeLessThan(1);
    }
    const nacimiento = fechaNacimiento(2024, 11, azar);
    const corte = Date.UTC(2024, 2, 31);
    const edad = (corte - nacimiento.getTime()) / (365.25 * 86_400_000);
    expect(Math.floor(edad)).toBe(11);
  });

  it('la factorización de Cholesky reconstruye la matriz', () => {
    const m = [
      [1, 0.5],
      [0.5, 1],
    ];
    const l = cholesky(m);
    const r = (i: number, j: number) => (l[i] as number[]).reduce((s, v, k) => s + v * ((l[j] as number[])[k] ?? 0), 0);
    expect(r(0, 1)).toBeCloseTo(0.5);
    expect(r(1, 1)).toBeCloseTo(1);
  });
});
