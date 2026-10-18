import { describe, expect, it } from 'vitest';
import { notaAnual } from '../src/utils/recuperaciones';
import {
  CONFIGURACION_ANTICIPADA_INICIAL,
  evaluarCriterio,
  periodosParaPromediar,
  planDeNotasNoCursadas,
  requisitosPendientes,
  tramiteAbierto,
  validarConfiguracionAnticipada,
  ventanaAbierta,
} from '../src/utils/promocionAnticipada';

const nota = (subject_id: string, valor: number | null) => ({ subject_id, nombre: subject_id.toUpperCase(), nota: valor });
const { rendimiento_excepcional, reiniciantes } = CONFIGURACION_ANTICIPADA_INICIAL;

describe('criterio de notas del colegio', () => {
  it('cumple con el promedio y la nota mínima por asignatura', () => {
    const r = evaluarCriterio([nota('mat', 4.8), nota('esp', 4.6), nota('cie', 4.7)], rendimiento_excepcional, 2);
    expect(r).toMatchObject({ cumple: true, promedio: 4.7, motivos: [] });
  });

  it('una sola asignatura por debajo de la mínima basta para no cumplir, aunque el promedio alcance', () => {
    const r = evaluarCriterio([nota('mat', 5), nota('esp', 5), nota('cie', 3.8)], rendimiento_excepcional, 2);
    expect(r.cumple).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/CIE/);
  });

  it('sin todas las notas cerradas no se decide ni se promedia lo que falta', () => {
    const r = evaluarCriterio([nota('mat', 5), nota('esp', null)], rendimiento_excepcional, 2);
    expect(r).toMatchObject({ cumple: false, promedio: null });
    expect(r.motivos[0]).toMatch(/ESP/);
  });

  it('el criterio de reiniciantes es otro: sin mínimo por asignatura', () => {
    expect(evaluarCriterio([nota('mat', 4.1), nota('esp', 4), nota('cie', 3.2)], reiniciantes, 2).cumple).toBe(false);
    expect(evaluarCriterio([nota('mat', 4.5), nota('esp', 4.2), nota('cie', 3.3)], reiniciantes, 2).cumple).toBe(true);
  });
});

describe('ventana de solicitud', () => {
  const fin = new Date('2026-04-10T00:00:00.000Z');
  it('se puede solicitar hasta los días configurados después del cierre del periodo (cierre inclusivo)', () => {
    expect(ventanaAbierta(fin, 30, new Date('2026-04-10T20:00:00.000Z'))).toBe(true);
    expect(ventanaAbierta(fin, 30, new Date('2026-05-10T20:00:00.000Z'))).toBe(true);
    expect(ventanaAbierta(fin, 30, new Date('2026-05-12T00:00:00.000Z'))).toBe(false);
    expect(ventanaAbierta(fin, 0, new Date('2026-04-12T00:00:00.000Z'))).toBe(false);
  });
});

describe('pasos exigidos por el colegio', () => {
  const todos = { concepto_comision: true, consentimiento_familia: true, decision_consejo_directivo: true };
  const nada = { concepto_favorable: null, consentimiento_otorgado: null, decision_aprobada: null };

  it('lista lo que falta y queda vacía cuando todo está cumplido', () => {
    expect(requisitosPendientes(todos, nada)).toHaveLength(3);
    expect(requisitosPendientes(todos, { concepto_favorable: true, consentimiento_otorgado: true, decision_aprobada: true })).toEqual([]);
  });

  it('un concepto desfavorable no cuenta como cumplido', () => {
    expect(requisitosPendientes(todos, { concepto_favorable: false, consentimiento_otorgado: true, decision_aprobada: true })).toHaveLength(1);
  });

  it('un colegio puede no exigir un paso: lo que no se exige no se pide', () => {
    expect(requisitosPendientes({ ...todos, concepto_comision: false, decision_consejo_directivo: false }, { ...nada, consentimiento_otorgado: true })).toEqual([]);
  });

  it('solo un trámite SOLICITADA o LISTA admite pasos', () => {
    expect(['SOLICITADA', 'LISTA_PARA_RESOLUCION'].every((e) => tramiteAbierto(e as never))).toBe(true);
    expect(['RESUELTA', 'APLICADA', 'RECHAZADA', 'ANULADA'].some((e) => tramiteAbierto(e as never))).toBe(false);
  });
});

describe('notas de los periodos que no cursó', () => {
  const nuevas = [{ subject_id: 'mat', nombre: 'Matemáticas' }, { subject_id: 'esp', nombre: 'Español' }, { subject_id: 'ing', nombre: 'Inglés técnico' }];
  const origen = [nota('mat', 4.8), nota('esp', 4.5), nota('cie', 4.9)];

  it('NIVELACION: todas las asignaturas del grado nuevo exigen nivelación', () => {
    expect(planDeNotasNoCursadas('NIVELACION', nuevas, origen).map((p) => p.modo)).toEqual(['NIVELACION', 'NIVELACION', 'NIVELACION']);
  });

  it('COPIAR_EQUIVALENTES: copia la equivalente y exige nivelación SOLO en la asignatura huérfana', () => {
    const plan = planDeNotasNoCursadas('COPIAR_EQUIVALENTES', nuevas, origen);
    expect(plan.map((p) => [p.subject_id, p.modo, p.nota])).toEqual([['mat', 'COPIADA', 4.8], ['esp', 'COPIADA', 4.5], ['ing', 'NIVELACION', null]]);
    expect(plan[2]?.motivo).toMatch(/sin equivalente/);
  });

  it('COPIAR_EQUIVALENTES: una equivalente sin nota cerrada tampoco se inventa: va a nivelación', () => {
    const plan = planDeNotasNoCursadas('COPIAR_EQUIVALENTES', [{ subject_id: 'mat', nombre: 'Matemáticas' }], [nota('mat', null)]);
    expect(plan[0]).toMatchObject({ modo: 'NIVELACION', nota: null });
  });

  it('DEJAR_SIN_NOTA: ninguna asignatura exige nota', () => {
    expect(planDeNotasNoCursadas('DEJAR_SIN_NOTA', nuevas, origen).every((p) => p.modo === 'SIN_NOTA' && p.nota === null)).toBe(true);
  });
});

describe('periodo sin nota: su porcentaje se reparte entre los restantes', () => {
  const periodos = [{ numero: 1, porcentaje: 25 }, { numero: 2, porcentaje: 25 }, { numero: 3, porcentaje: 25 }, { numero: 4, porcentaje: 25 }];
  const notas = new Map([[2, 4], [3, 3], [4, 5]]);
  const anual = (omitidos: number[]) => notaAnual(periodosParaPromediar(periodos, new Set(omitidos)).map((p) => ({ porcentaje: p.porcentaje, nota: notas.get(p.numero) ?? null })), 2);

  it('sin omitir, el periodo 1 sin nota deja el año sin definitiva (hueco que bloquea el cierre)', () => {
    expect(anual([])).toBeNull();
  });

  it('omitiendo el P1, P2, P3 y P4 pasan a valer un tercio cada uno', () => {
    expect(anual([1])).toBe(4);
  });

  it('con pesos desiguales se reparte en proporción al peso de cada periodo restante', () => {
    const desiguales = [{ numero: 1, porcentaje: 10 }, { numero: 2, porcentaje: 20 }, { numero: 3, porcentaje: 30 }, { numero: 4, porcentaje: 40 }];
    const r = notaAnual(periodosParaPromediar(desiguales, new Set([1])).map((p) => ({ porcentaje: p.porcentaje, nota: notas.get(p.numero) ?? null })), 2);
    expect(r).toBe(4.11);
  });
});

describe('validar configuración', () => {
  it('acepta los valores de partida y rechaza los absurdos', () => {
    expect(validarConfiguracionAnticipada(CONFIGURACION_ANTICIPADA_INICIAL)).toBeNull();
    expect(validarConfiguracionAnticipada({ ...CONFIGURACION_ANTICIPADA_INICIAL, periodo_evaluacion: 0 })).toMatch(/periodo/);
    expect(validarConfiguracionAnticipada({ ...CONFIGURACION_ANTICIPADA_INICIAL, dias_ventana_tras_cierre: -1 })).toMatch(/ventana/);
    expect(validarConfiguracionAnticipada({ ...CONFIGURACION_ANTICIPADA_INICIAL, reiniciantes: { ...reiniciantes, promedio_minimo: 0 } })).toMatch(/reiniciantes/);
  });

  it('el tratamiento de notas de partida es la nivelación (la opción conservadora)', () => {
    expect(CONFIGURACION_ANTICIPADA_INICIAL.tratamiento_notas).toBe('NIVELACION');
  });
});
