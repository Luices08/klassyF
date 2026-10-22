import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { cargarConfiguracion, planDeGrado } from '../scripts/simulacion/configuracion';
import { asignarCarga } from '../scripts/simulacion/logica/asignadorCarga';
import { categoriasDelGrado, cholesky, fechaNacimiento, generarEstudiante } from '../scripts/simulacion/logica/perfiles';
import { azarPara } from '../scripts/simulacion/nucleo/azar';
import { categoriaDeHabilidad, confirmaPazYSalvo, decidirSalida, evolucionarLatentes, planearServicioSocial, registroSaber11 } from '../scripts/simulacion/logica/trayectoria';
import {
  decidirEntrega,
  diasLectivos,
  familiaDeAsignatura,
  intentoDeRecuperacion,
  moverLectivos,
  NOTA_NO_ENTREGADA,
  nivelEsperado,
  notaDeActividad,
  notasFormativas,
  planearActividades,
} from '../scripts/simulacion/logica/notas';
import { despuesDelCorte, ejecutarEventos, Evento } from '../scripts/simulacion/nucleo/eventos';
import { horaReal } from '../scripts/simulacion/nucleo/reloj';
import {
  aCsv,
  aEjemplosBrain,
  cortesPosibles,
  entradasAlCorte,
  etiquetaDeResultado,
  FilaExportada,
  normalizarNota,
  partirPorAnio,
  resumirFilas,
} from '../scripts/simulacion/logica/exportacion';
import { festivosColombia, isoDia, pascua, semanaSanta } from '../scripts/simulacion/nucleo/fechas';
import { ausenciaDelDia, diasDeClase, faltasDelPeriodo, hayRetardo, poisson, tramos } from '../scripts/simulacion/logica/asistencia';

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

describe('simulación: notas de un periodo', () => {
  const lectivos = diasLectivos(new Date(Date.UTC(2024, 0, 29)), new Date(Date.UTC(2024, 3, 12)), [{ inicio: new Date(Date.UTC(2024, 2, 25)), fin: new Date(Date.UTC(2024, 2, 29)) }]);

  it('los días lectivos excluyen fines de semana y recesos', () => {
    expect(lectivos.every((d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6)).toBe(true);
    expect(lectivos.some((d) => d.toISOString().startsWith('2024-03-27'))).toBe(false);
    expect(moverLectivos(lectivos, new Date(Date.UTC(2024, 2, 22)), 1).toISOString().slice(0, 10)).toBe('2024-04-01');
  });

  it('planea las actividades en orden, con la evaluación al final y la apertura antes del límite', () => {
    const plan = planearActividades(lectivos.slice(4, -12), 4, 8, azarPara(1, 'plan'));
    expect(plan).toHaveLength(5);
    expect(plan.at(-1)?.tipo).toBe('EVALUACION');
    expect(plan.filter((p) => p.digital)).toHaveLength(2);
    for (const p of plan) expect(p.apertura.getTime()).toBeLessThan(p.entrega.getTime());
    expect(planearActividades(lectivos, 4, 1, azarPara(1, 'plan')).some((p) => p.digital)).toBe(false);
  });

  it('una actividad no entregada vale 1.0 y las notas quedan en la escala con un decimal', () => {
    const azar = azarPara(5, 'notas');
    const e = generarEstudiante(config, 7, 'ALTO', azar);
    expect(notaDeActividad(4.2, e.latentes, 'CRITICA', 'TAREA', { entrega: false, tarde: false }, azar)).toBe(NOTA_NO_ENTREGADA);
    for (let i = 0; i < 300; i += 1) {
      const n = notaDeActividad(4.2, e.latentes, 'CRITICA', 'EVALUACION', decidirEntrega(e.latentes, 'EVALUACION', azar), azar);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      expect(Math.round(n * 10) / 10).toBe(n);
    }
  });

  it('un estudiante alto saca en promedio más que uno bajo y la familia de área sale del código de la asignatura', () => {
    const azar = azarPara(9, 'comparar');
    const promedio = (categoria: string) => {
      let s = 0;
      for (let i = 0; i < 200; i += 1) {
        const e = generarEstudiante(config, 8, categoria, azar);
        s += notaDeActividad(e.latentes.habilidad, e.latentes, 'MODERADA', 'TAREA', decidirEntrega(e.latentes, 'TAREA', azar), azar);
      }
      return s / 200;
    };
    expect(promedio('SUPERIOR') - promedio('BAJO')).toBeGreaterThan(1.5);
    expect(familiaDeAsignatura('FQ')).toBe('CIENCIAS');
    expect(familiaDeAsignatura('ETI')).toBe('FORMATIVAS');
  });

  it('una recuperación superada queda en 3.0 o más y una perdida por debajo', () => {
    const azar = azarPara(11, 'recu');
    const e = generarEstudiante(config, 9, 'BASICO', azar);
    for (let i = 0; i < 200; i += 1) {
      const n = intentoDeRecuperacion(2.8, e.latentes, azar);
      if (n !== null) expect(n >= 3 || n <= 2.9).toBe(true);
    }
  });
});

describe('simulación: el año completo de la matriz de perfiles', () => {
  const plan = (grado: number) => (config.plan_estudios.find((p) => p.grados.includes(grado))?.asignaturas ?? {}) as Record<string, number>;
  const tipos = new Map(config.areas.flatMap((a) => a.asignaturas.map((x) => [x.clave, x.tipo_nota] as const)));

  /** Asignaturas perdidas en el año: promedio de cuatro periodos con la recuperación de periodo (tope en la aprobatoria). */
  function perdidasDelAnio(grado: number, categoria: string, id: string): number {
    const generado = generarEstudiante(config, grado, categoria, azarPara(config.semilla, 'est', id));
    let perdidas = 0;
    for (const [clave, horas] of Object.entries(plan(grado))) {
      const periodos: number[] = [];
      for (let periodo = 1; periodo <= 4; periodo += 1) {
        const azar = azarPara(config.semilla, 'anual', id, clave, periodo);
        const esperado = nivelEsperado({ latentes: generado.latentes, categoria }, clave, tipos.get(clave) ?? 'MODERADA', periodo);
        const actividades = planearActividades(Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i))), horas, grado, azar);
        const sueltas = actividades.filter((a) => a.peso === null).length;
        let suma = 0;
        for (const a of actividades) {
          const peso = a.peso ?? 70 / sueltas;
          suma += peso * notaDeActividad(esperado, generado.latentes, tipos.get(clave) ?? 'MODERADA', a.tipo, decidirEntrega(generado.latentes, a.tipo, azar), azar);
        }
        const f = notasFormativas(esperado, generado.latentes, azar);
        let nota = 0.7 * (suma / 100) + 0.1 * (f.AUTO + f.COEV + f.COMP);
        if (nota < config.escala.aprobatoria) {
          const recuperada = intentoDeRecuperacion(esperado, generado.latentes, azar);
          if (recuperada !== null && recuperada >= config.escala.aprobatoria) nota = config.escala.aprobatoria;
        }
        periodos.push(nota);
      }
      if (periodos.reduce((x, y) => x + y, 0) / 4 < config.escala.aprobatoria) perdidas += 1;
    }
    return perdidas;
  }

  it('reprueba el año (dos o más asignaturas) una fracción realista y solo quien tiene el perfil bajo o básico', () => {
    const grados = config.grupos.map((g) => g.grado).filter((g) => g > 0);
    let total = 0;
    let reprueban = 0;
    const porCategoria: Record<string, { n: number; r: number }> = {};
    for (const grado of grados) {
      const categorias = categoriasDelGrado(config, grado, 60, azarPara(config.semilla, 'cat', grado));
      categorias.forEach((categoria, i) => {
        const r = perdidasDelAnio(grado, categoria, `${grado}-${i}`) >= 2;
        total += 1;
        if (r) reprueban += 1;
        const c = (porCategoria[categoria] ??= { n: 0, r: 0 });
        c.n += 1;
        if (r) c.r += 1;
      });
    }
    expect(reprueban / total).toBeGreaterThan(0.07);
    expect(reprueban / total).toBeLessThan(0.2);
    expect(porCategoria.SUPERIOR?.r).toBe(0);
    expect(porCategoria.ALTO?.r ?? 0).toBeLessThanOrEqual(2);
    expect((porCategoria.BAJO?.r ?? 0) / (porCategoria.BAJO?.n ?? 1)).toBeGreaterThan(0.8);
  });
});

describe('simulación: trayectoria de un año al siguiente', () => {
  const generar = (categoria: string, id: string) => generarEstudiante(config, 7, categoria, azarPara(1, 'tray', id)).latentes;

  it('la categoría sigue la habilidad por los cortes de la matriz', () => {
    expect(categoriaDeHabilidad(2.3)).toBe('BAJO');
    expect(categoriaDeHabilidad(3.4)).toBe('BASICO');
    expect(categoriaDeHabilidad(4.2)).toBe('ALTO');
    expect(categoriaDeHabilidad(4.8)).toBe('SUPERIOR');
  });

  it('las latentes evolucionan dentro de sus rangos y quien repite mejora en promedio', () => {
    let con = 0;
    let sin = 0;
    for (let i = 0; i < 300; i += 1) {
      const l = generar('BASICO', `e${i}`);
      const siguiente = evolucionarLatentes(l, false, azarPara(1, 'ev', i));
      const repite = evolucionarLatentes(l, true, azarPara(1, 'ev', i));
      for (const x of [siguiente, repite]) {
        expect(x.habilidad).toBeGreaterThanOrEqual(1.2);
        expect(x.habilidad).toBeLessThanOrEqual(5);
        expect(x.constancia).toBeLessThanOrEqual(0.99);
        expect(Math.abs(x.tendencia)).toBeLessThanOrEqual(0.15);
      }
      sin += siguiente.habilidad - l.habilidad;
      con += repite.habilidad - l.habilidad;
    }
    expect(con / 300).toBeGreaterThan(sin / 300 + 0.1);
  });

  it('sale del colegio una minoría, sobre todo quien tiene más riesgo de deserción, y la salida trae tipo y motivo', () => {
    let salen = 0;
    let altoRiesgo = 0;
    let bajoRiesgo = 0;
    for (let i = 0; i < 2000; i += 1) {
      const l = generar(i % 2 === 0 ? 'BAJO' : 'ALTO', `s${i}`);
      const salida = decidirSalida(l, azarPara(1, 'sal', i));
      if (!salida) continue;
      salen += 1;
      expect(['RETIRO', 'TRASLADO']).toContain(salida.tipo);
      expect(salida.motivo.length).toBeGreaterThan(10);
      if (l.riesgo_desercion > 0.3) altoRiesgo += 1;
      else bajoRiesgo += 1;
    }
    // Tres periodos de oportunidad: la fracción anual es de pocos puntos, no una deserción masiva.
    expect(salen / 2000).toBeGreaterThan(0.005);
    expect(salen / 2000).toBeLessThan(0.1);
    expect(altoRiesgo).toBeGreaterThan(bajoRiesgo);
  });

  it('el servicio social pide solo las horas que faltan, en tandas de hasta 40 h', () => {
    const azar = azarPara(1, 'ss');
    const tandas = Array.from({ length: 200 }, () => planearServicioSocial(0, 80, 0.9, azar)).filter((t) => t !== null);
    expect(tandas.length).toBeGreaterThan(150);
    for (const t of tandas) expect(t?.horas).toBe(40);
    expect(planearServicioSocial(80, 80, 0.9, azar)).toBeNull();
    expect(planearServicioSocial(70, 80, 1, azarPara(1, 'ss2'))?.horas ?? 10).toBe(10);
  });

  it('el registro de Saber 11 tiene la forma que valida el sistema y casi todos confirman el paz y salvo', () => {
    for (let i = 0; i < 50; i += 1) expect(registroSaber11(2024, azarPara(1, 's11', i))).toMatch(/^AC\d{8,12}$/);
    const confirman = Array.from({ length: 1000 }, (_, i) => confirmaPazYSalvo(azarPara(1, 'pz', i))).filter(Boolean).length;
    expect(confirman).toBeGreaterThan(900);
    expect(confirman).toBeLessThan(1000);
  });
});

describe('simulación: eventos con fecha y corte', () => {
  const dia = (iso: string, hora = '12:00') => new Date(`${iso}T${hora}:00-05:00`);
  afterAll(() => horaReal());

  it('ejecuta en orden de fecha, suma lo que se agenda al correr y deja para después lo que pasa del corte', async () => {
    const orden: string[] = [];
    const nuevos: Evento[] = [];
    const eventos: Evento[] = [
      { cuando: dia('2026-10-23'), correr: async () => void orden.push('después del corte') },
      { cuando: dia('2026-10-20'), correr: async () => void orden.push('segundo') },
      {
        cuando: dia('2026-10-10'),
        correr: async () => {
          orden.push('primero');
          nuevos.push({ cuando: dia('2026-10-15'), correr: async () => void orden.push('agendado') });
        },
      },
      { cuando: dia('2026-10-22', '23:30'), correr: async () => void orden.push('último del día de corte') },
    ];
    const corte = new Date(Date.UTC(2026, 9, 22));
    const sinEjecutar = await ejecutarEventos(eventos, nuevos, { corte });
    expect(orden).toEqual(['primero', 'agendado', 'segundo', 'último del día de corte']);
    expect(sinEjecutar).toBe(1);
    expect(despuesDelCorte({ corte }, dia('2026-10-22', '23:59'))).toBe(false);
    expect(despuesDelCorte({ corte }, dia('2026-10-23', '00:00'))).toBe(true);
  });
});

describe('simulación: exportador de datos', () => {
  const escala = { minima: 1, maxima: 5, aprobatoria: 3 };
  const notas = [
    { periodo: 1, nota: 4 },
    { periodo: 1, nota: 2 },
    { periodo: 1, nota: 3 },
    { periodo: 2, nota: 1 },
    { periodo: 2, nota: 1 },
    { periodo: 2, nota: 1 },
  ];
  const entregas = [
    { periodo: 1, entregada: true },
    { periodo: 1, entregada: false },
    { periodo: 2, entregada: false },
    { periodo: 2, entregada: false },
  ];

  it('lleva la nota a 0–1 con la escala del año y acota lo que se sale', () => {
    expect(normalizarNota(1, escala)).toBe(0);
    expect(normalizarNota(3, escala)).toBe(0.5);
    expect(normalizarNota(5, escala)).toBe(1);
    expect(normalizarNota(6, escala)).toBe(1);
    expect(() => normalizarNota(3, { minima: 3, maxima: 3, aprobatoria: 3 })).toThrow();
  });

  it('el corte solo usa lo registrado hasta ese periodo (nada del futuro)', () => {
    const base = { totalPeriodos: 4, notas, entregas, esRepitente: false, escala, asistencia: [], faltas: [] };
    const p1 = entradasAlCorte({ ...base, corte: 1 });
    const p2 = entradasAlCorte({ ...base, corte: 2 });
    expect(p1).toMatchObject({ promedio_academico: 0.5, tareas_no_entregadas: 0.5, asignaturas_perdidas_ratio: 0.3333, periodo_norm: 0.25 });
    expect(p2).toMatchObject({ tareas_no_entregadas: 0.75, asignaturas_perdidas_ratio: 0.6667, periodo_norm: 0.5 });
    // Cambiar una nota del periodo 2 no altera la foto del corte 1.
    const otras = notas.map((n) => (n.periodo === 2 ? { ...n, nota: 5 } : n));
    expect(entradasAlCorte({ ...base, notas: otras, corte: 1 })).toEqual(p1);
  });

  it('sin notas suficientes no hay fila, y sin actividades las tareas no entregadas valen 0, no se inventan', () => {
    const base = { totalPeriodos: 4, entregas: [], esRepitente: true, escala, asistencia: [], faltas: [] };
    expect(entradasAlCorte({ ...base, notas: notas.slice(0, 2), corte: 1 })).toBeNull();
    expect(entradasAlCorte({ ...base, notas, corte: 2 })).toMatchObject({ tareas_no_entregadas: 0, es_repitente: 1 });
  });

  it('la inasistencia y las alertas de convivencia también se cortan, y la Tipo I no es alerta', () => {
    const base = {
      totalPeriodos: 4,
      notas,
      entregas,
      esRepitente: false,
      escala,
      asistencia: [
        { periodo: 1, registros: 100, fallas_injustificadas: 5 },
        { periodo: 2, registros: 100, fallas_injustificadas: 25 },
      ],
      faltas: [
        { periodo: 1, gravedad: 'I' as const },
        { periodo: 1, gravedad: 'I' as const },
        { periodo: 1, gravedad: 'II' as const },
        { periodo: 2, gravedad: 'III' as const },
        { periodo: 2, gravedad: 'III' as const },
      ],
    };
    expect(entradasAlCorte({ ...base, corte: 1 })).toMatchObject({ ratio_inasistencias: 0.05, alertas_convivencia: 0.25 });
    expect(entradasAlCorte({ ...base, corte: 2 })).toMatchObject({ ratio_inasistencias: 0.15, alertas_convivencia: 1 });
    expect(entradasAlCorte({ ...base, asistencia: [], faltas: [], corte: 2 })).toMatchObject({ ratio_inasistencias: 0, alertas_convivencia: 0 });
  });

  it('los cortes posibles dejan fuera el último periodo y los que no están cerrados', () => {
    expect(cortesPosibles([1, 2, 3, 4], 4)).toEqual([1, 2, 3]);
    expect(cortesPosibles([1, 2], 4)).toEqual([1, 2]);
    expect(cortesPosibles([], 4)).toEqual([]);
  });

  it('la etiqueta solo existe con un resultado final del cierre', () => {
    expect(etiquetaDeResultado('NO_PROMOVIDO')).toBe(1);
    expect(etiquetaDeResultado('PROMOVIDO')).toBe(0);
    expect(etiquetaDeResultado('PROMOVIDO_POR_RECUPERACION')).toBe(0);
    expect(etiquetaDeResultado('PENDIENTE_RECUPERACION')).toBeNull();
    expect(etiquetaDeResultado('EN_COMISION')).toBeNull();
    expect(etiquetaDeResultado(undefined)).toBeNull();
  });

  const fila = (anio: number, estudiante: string, pierde: 0 | 1 | null): FilaExportada => ({
    anio,
    student_id: estudiante,
    sede_id: 's1',
    grado_numero: 6,
    grupo: '6A, "x"',
    periodo_corte: 1,
    entradas: { promedio_academico: 0.5, tareas_no_entregadas: 0, es_repitente: 0, periodo_norm: 0.25, asignaturas_perdidas_ratio: 0, ratio_inasistencias: 0, alertas_convivencia: 0 },
    pierde_anio: pierde,
    resultado_final: pierde === null ? null : pierde === 1 ? 'NO_PROMOVIDO' : 'PROMOVIDO',
  });

  it('parte por año: el último con etiquetas es la prueba y ningún año cae en los dos lados', () => {
    const filas = [fila(2024, 'a', 0), fila(2024, 'b', 1), fila(2025, 'a', 0), fila(2026, 'a', null)];
    const { entrenamiento, prueba, anioPrueba } = partirPorAnio(filas);
    expect(anioPrueba).toBe(2025);
    expect(entrenamiento.map((f) => f.anio)).toEqual([2024, 2024]);
    expect(prueba.map((f) => f.anio)).toEqual([2025]);
    expect(partirPorAnio(filas, 2024).anioPrueba).toBe(2024);
    expect(() => partirPorAnio(filas, 2026)).toThrow(/2026/);
    expect(partirPorAnio([fila(2024, 'a', 0)]).prueba).toEqual([]);
  });

  it('el CSV escapa comillas y comas, deja vacío lo que no existe, y Brain.js solo recibe filas con etiqueta', () => {
    const filas = [fila(2024, 'a', 1), fila(2026, 'b', null)];
    const lineas = aCsv(filas).trim().split('\n');
    expect(lineas[0]).toContain('periodo_corte');
    expect(lineas[1]).toContain('"6A, ""x"""');
    expect(lineas[2]).toMatch(/,,$/);
    const brain = aEjemplosBrain(filas);
    expect(brain).toHaveLength(1);
    expect(brain[0]).toMatchObject({ output: { pierde_anio: 1 } });
    expect(resumirFilas(filas)).toMatchObject({ filas: 2, estudiantes: 2, positivos: 1, tasa_positivos: 1 });
  });
});

describe('simulación: asistencia y convivencia', () => {
  const parametros = { proporcion_justificadas: 0.4, factor_retardo: 0.5, dias_por_registro: 10 };

  it('la inasistencia sigue a asistencia_base y una parte trae excusa', () => {
    const conteo = { INJUSTIFICADA: 0, JUSTIFICADA: 0, nada: 0 };
    for (let i = 0; i < 20000; i += 1) {
      const r = ausenciaDelDia({ asistencia_base: 0.1 }, parametros, azarPara(3, 'a', i));
      conteo[r ?? 'nada'] += 1;
    }
    const faltas = conteo.INJUSTIFICADA + conteo.JUSTIFICADA;
    expect(faltas / 20000).toBeGreaterThan(0.09);
    expect(faltas / 20000).toBeLessThan(0.11);
    expect(conteo.JUSTIFICADA / faltas).toBeGreaterThan(0.36);
    expect(conteo.JUSTIFICADA / faltas).toBeLessThan(0.44);
    expect(ausenciaDelDia({ asistencia_base: 0 }, parametros, azarPara(3, 'b'))).toBeNull();
  });

  it('el retardo nunca pasa del 30 % aunque la puntualidad sea mala', () => {
    let tarde = 0;
    for (let i = 0; i < 10000; i += 1) if (hayRetardo({ puntualidad: 5 }, parametros, azarPara(4, i))) tarde += 1;
    expect(tarde / 10000).toBeLessThan(0.33);
    expect(tarde / 10000).toBeGreaterThan(0.27);
  });

  it('una clase solo toma lista los días que el horario la dicta, y sin horario todos los días', () => {
    const lunes = new Date(Date.UTC(2026, 1, 2));
    const semana = [0, 1, 2, 3, 4].map((d) => new Date(lunes.getTime() + d * 86400000));
    expect(diasDeClase(semana, new Set([1, 3])).map(isoDia)).toEqual(['2026-02-02', '2026-02-04']);
    expect(diasDeClase(semana, undefined)).toHaveLength(5);
    expect(diasDeClase(semana, new Set())).toHaveLength(5);
  });

  it('parte los días en tramos y rechaza un tramo vacío', () => {
    expect(tramos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(tramos([], 3)).toEqual([]);
    expect(() => tramos([1], 0)).toThrow();
  });

  it('poisson da la media pedida y cero con lambda cero', () => {
    let suma = 0;
    for (let i = 0; i < 20000; i += 1) suma += poisson(1.5, azarPara(5, i));
    expect(suma / 20000).toBeGreaterThan(1.45);
    expect(suma / 20000).toBeLessThan(1.55);
    expect(poisson(0, azarPara(5, 'x'))).toBe(0);
  });

  it('las faltas graves crecen más rápido que las leves con el riesgo y casi no existen en primaria baja', () => {
    const conv = { tasa: { I: 1, II: 0.15, III: 0.06 }, factor_secundaria: 1.4, factor_primaria_baja: 0.3 };
    const media = (riesgo: number, grado: number) => {
      const suma = { I: 0, II: 0, III: 0 };
      for (let i = 0; i < 5000; i += 1) {
        const f = faltasDelPeriodo({ riesgo_convivencia: riesgo }, grado, conv, azarPara(6, riesgo, grado, i));
        suma.I += f.I;
        suma.II += f.II;
        suma.III += f.III;
      }
      return { I: suma.I / 5000, II: suma.II / 5000, III: suma.III / 5000 };
    };
    const bajo = media(0.5, 7);
    const alto = media(2, 7);
    expect(alto.I / bajo.I).toBeGreaterThan(3); // lineal: ×4
    expect(alto.II / bajo.II).toBeGreaterThan(10); // cuadrático: ×16
    expect(media(1, 1).I).toBeLessThan(media(1, 7).I / 3);
  });
});
