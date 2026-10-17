import { describe, expect, it } from 'vitest';
import {
  AsignaturaEntrada,
  EntradaPromocion,
  PoliticaPromocion,
  Regla,
  conceptoOficial,
  evaluarPromocion,
  politicaInicial,
  validarPolitica,
} from '../src/utils/promocion';

const asig = (id: string, nota: number | null, extra: Partial<AsignaturaEntrada> = {}): AsignaturaEntrada => ({
  subject_id: id,
  area_id: `area-${id}`,
  nombre: id,
  nota_antes: nota,
  nota_final: nota,
  recuperacion: null,
  inasistencia_total_pct: 0,
  inasistencia_injustificada_pct: 0,
  ...extra,
});

const entrada = (asignaturas: AsignaturaEntrada[], extra: Partial<EntradaPromocion> = {}): EntradaPromocion => ({
  grado_id: 'g7',
  nivel: 'SECUNDARIA',
  nota_aprobatoria: 3,
  asignaturas,
  areas: asignaturas.map((a) => ({ area_id: a.area_id, nombre: a.nombre, nota_antes: a.nota_antes, nota_final: a.nota_final, recuperacion: a.recuperacion })),
  promedio_general: 3.5,
  inasistencia_global_total_pct: 0,
  inasistencia_global_injustificada_pct: 0,
  faltas_por_gravedad: {},
  tiene_piar: false,
  admite_recuperacion_final: true,
  max_recuperables: 0,
  ...extra,
});

const regla = (r: Partial<Regla> & Pick<Regla, 'clave' | 'condiciones' | 'accion'>): Regla => ({
  nombre: r.clave,
  activa: true,
  momentos: ['CIERRE', 'TRAS_RECUPERACION'],
  niveles: [],
  grados_ids: [],
  ...r,
});

const politica = (reglas: Regla[], extra: Partial<PoliticaPromocion> = {}): PoliticaPromocion => ({ ...politicaInicial(), reglas, ...extra });

describe('reprobación por cantidad y por materia obligatoria', () => {
  const pol = politica(
    [
      regla({ clave: 'tres-o-mas', condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: 3, filtro: 'TODAS' }], accion: 'NO_PROMUEVE' }),
      regla({ clave: 'dos-con-critica', condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: 2, filtro: 'TODAS' }, { tipo: 'PERDIDAS_AL_MENOS', n: 1, filtro: 'CRITICAS' }], accion: 'NO_PROMUEVE' }),
    ],
    { asignaturas_criticas_ids: ['esp'] }
  );

  it('pierde el año con 3 asignaturas aunque ninguna sea crítica', () => {
    const r = evaluarPromocion(entrada([asig('a', 2), asig('b', 2), asig('c', 2), asig('mat', 4)]), pol, 'CIERRE');
    expect(r.resultado).toBe('NO_PROMOVIDO');
  });

  it('con 2 perdidas pierde solo si una es crítica', () => {
    expect(evaluarPromocion(entrada([asig('a', 2), asig('esp', 2)]), pol, 'CIERRE').resultado).toBe('NO_PROMOVIDO');
    expect(evaluarPromocion(entrada([asig('a', 2), asig('b', 2)]), pol, 'CIERRE').resultado).toBe('PENDIENTE_RECUPERACION');
  });

  it('aprueba directo sin asignaturas perdidas', () => {
    expect(evaluarPromocion(entrada([asig('a', 4), asig('b', 3)]), pol, 'CIERRE').resultado).toBe('PROMOVIDO');
  });
});

describe('inasistencia y deserción', () => {
  it('reprueba por inasistencia injustificada, sin contar las justificadas', () => {
    const pol = politica([regla({ clave: 'faltas', condiciones: [{ tipo: 'INASISTENCIA_GLOBAL_SUPERA', porcentaje: 25, faltas: 'SOLO_INJUSTIFICADAS' }], accion: 'NO_PROMUEVE' })]);
    const justificadas = entrada([asig('a', 4)], { inasistencia_global_total_pct: 40, inasistencia_global_injustificada_pct: 10 });
    expect(evaluarPromocion(justificadas, pol, 'CIERRE').resultado).toBe('PROMOVIDO');
    const injustificadas = entrada([asig('a', 4)], { inasistencia_global_total_pct: 40, inasistencia_global_injustificada_pct: 30 });
    expect(evaluarPromocion(injustificadas, pol, 'CIERRE').resultado).toBe('NO_PROMOVIDO');
  });

  it('la deserción propone retiro y gana sobre reprobar, aunque falten notas', () => {
    const pol = politica([
      regla({ clave: 'inasistencia', condiciones: [{ tipo: 'INASISTENCIA_GLOBAL_SUPERA', porcentaje: 25, faltas: 'TODAS' }], accion: 'NO_PROMUEVE' }),
      regla({
        clave: 'desercion',
        condiciones: [{ tipo: 'INASISTENCIA_GLOBAL_SUPERA', porcentaje: 25, faltas: 'TODAS' }, { tipo: 'SIN_NOTA_AL_MENOS', n: 1 }],
        accion: 'PROPONE_RETIRO',
      }),
    ]);
    const r = evaluarPromocion(entrada([asig('a', null), asig('b', 2)], { inasistencia_global_total_pct: 60 }), pol, 'CIERRE');
    expect(r.resultado).toBe('RETIRO_PROPUESTO');
  });
});

describe('recuperación final', () => {
  const pol = politica([regla({ clave: 'cuatro', condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: 4, filtro: 'TODAS' }], accion: 'NO_PROMUEVE' })]);

  it('al cierre queda pendiente de recuperación con lo que debe recuperar', () => {
    const r = evaluarPromocion(entrada([asig('a', 2), asig('b', 4)]), pol, 'CIERRE');
    expect(r.resultado).toBe('PENDIENTE_RECUPERACION');
    expect(r.a_recuperar.map((u) => u.id)).toEqual(['a']);
  });

  it('si supera la recuperación queda promovido por recuperación', () => {
    const a = asig('a', 2, { nota_final: 3.2, recuperacion: 'SUPERADA' });
    expect(evaluarPromocion(entrada([a, asig('b', 4)]), pol, 'TRAS_RECUPERACION').resultado).toBe('PROMOVIDO_POR_RECUPERACION');
  });

  it('si no la supera y el colegio no admite arrastre, no es promovido', () => {
    const a = asig('a', 2, { nota_final: 2.5, recuperacion: 'NO_SUPERADA' });
    expect(evaluarPromocion(entrada([a, asig('b', 4)]), pol, 'TRAS_RECUPERACION').resultado).toBe('NO_PROMOVIDO');
  });

  it('sin recuperación final disponible, el cierre aplica la acción posterior', () => {
    const r = evaluarPromocion(entrada([asig('a', 2)], { admite_recuperacion_final: false }), pol, 'CIERRE');
    expect(r.resultado).toBe('NO_PROMOVIDO');
  });

  it('quien excede el tope de recuperables no tiene derecho a recuperar', () => {
    const r = evaluarPromocion(entrada([asig('a', 2), asig('b', 2), asig('c', 2)], { max_recuperables: 2 }), pol, 'CIERRE');
    expect(r.resultado).toBe('NO_PROMOVIDO');
  });

  it('no supera si no se presentó, y la regla lo detecta', () => {
    const pol2 = politica([regla({ clave: 'no-presento', momentos: ['TRAS_RECUPERACION'], condiciones: [{ tipo: 'RECUPERACION_NO_SUPERADA_AL_MENOS', n: 1 }], accion: 'NO_PROMUEVE' })]);
    const a = asig('a', 2, { recuperacion: 'NO_PRESENTO' });
    expect(evaluarPromocion(entrada([a]), pol2, 'TRAS_RECUPERACION').resultado).toBe('NO_PROMOVIDO');
  });
});

describe('promoción con arrastre', () => {
  const pol = politica([], {
    asignaturas_arrastrables_ids: ['edfis'],
    arrastre: { admite: true, max_unidades: 1, condicion: 'PLAN_APOYO_PRIMER_PERIODO', nota_minima: null, hasta_periodo: 1, si_incumple: 'ENVIA_A_COMISION' },
  });
  const perdida = (id: string) => asig(id, 2, { nota_final: 2.4, recuperacion: 'NO_SUPERADA' });

  it('pasa debiendo una asignatura no troncal', () => {
    const r = evaluarPromocion(entrada([perdida('edfis'), asig('mat', 4)]), pol, 'TRAS_RECUPERACION');
    expect(r.resultado).toBe('PROMOVIDO_CON_ARRASTRE');
    expect(r.arrastres.map((u) => u.id)).toEqual(['edfis']);
  });

  it('no pasa si debe una asignatura que no es arrastrable o debe más de las permitidas', () => {
    expect(evaluarPromocion(entrada([perdida('mat')]), pol, 'TRAS_RECUPERACION').resultado).toBe('NO_PROMOVIDO');
    expect(evaluarPromocion(entrada([perdida('edfis'), perdida('edfis2')]), { ...pol, asignaturas_arrastrables_ids: ['edfis', 'edfis2'] }, 'TRAS_RECUPERACION').resultado).toBe('NO_PROMOVIDO');
  });

  it('una política que no admite arrastre nunca lo concede', () => {
    const sin = { ...pol, arrastre: { ...pol.arrastre, admite: false } };
    expect(evaluarPromocion(entrada([perdida('edfis')]), sin, 'TRAS_RECUPERACION').resultado).toBe('NO_PROMOVIDO');
  });
});

describe('unidad por área', () => {
  it('cuenta áreas y respeta que perder una asignatura pierda el área', () => {
    const pol = politica([regla({ clave: 'una-area', condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: 1, filtro: 'TODAS' }], accion: 'NO_PROMUEVE' })], { unidad: 'AREA', area_pierde_con_asignatura_perdida: true });
    const e = entrada([asig('a', 2), asig('b', 4)]);
    e.areas = [{ area_id: 'ar', nombre: 'Humanidades', nota_antes: 3.2, nota_final: 3.2, recuperacion: null }];
    e.asignaturas[0].area_id = 'ar';
    e.asignaturas[1].area_id = 'ar';
    expect(evaluarPromocion(e, pol, 'CIERRE').resultado).toBe('NO_PROMOVIDO');
    expect(evaluarPromocion(e, { ...pol, area_pierde_con_asignatura_perdida: false }, 'CIERRE').resultado).toBe('PROMOVIDO');
  });
});

describe('convivencia, PIAR e incompletos', () => {
  it('las faltas de convivencia nunca reprueban: la política que lo intenta se rechaza', () => {
    const mala = politica([regla({ clave: 'disciplina', condiciones: [{ tipo: 'FALTAS_CONVIVENCIA_AL_MENOS', n: 1, gravedad: 'III' }], accion: 'NO_PROMUEVE' })]);
    expect(validarPolitica(mala)).toMatch(/convivencia/);
    const buena = politica([regla({ clave: 'disciplina', condiciones: [{ tipo: 'FALTAS_CONVIVENCIA_AL_MENOS', n: 1, gravedad: 'III' }], accion: 'NO_RENUEVA_CUPO' })]);
    expect(validarPolitica(buena)).toBeNull();
  });

  it('no renovar el cupo no cambia el resultado académico', () => {
    const pol = politica([regla({ clave: 'disciplina', condiciones: [{ tipo: 'FALTAS_CONVIVENCIA_AL_MENOS', n: 1, gravedad: 'II' }], accion: 'NO_RENUEVA_CUPO' })]);
    const r = evaluarPromocion(entrada([asig('a', 4)], { faltas_por_gravedad: { III: 1 } }), pol, 'CIERRE');
    expect(r.resultado).toBe('PROMOVIDO');
    expect(r.no_renueva_cupo).toBe(true);
  });

  it('un estudiante con PIAR se deriva a comisión si la política lo pide', () => {
    const pol = politica([], { piar: { derivar_a_comision: true } });
    expect(evaluarPromocion(entrada([asig('a', 2)], { tiene_piar: true }), pol, 'CIERRE').resultado).toBe('EN_COMISION');
    expect(evaluarPromocion(entrada([asig('a', 2)]), pol, 'CIERRE').resultado).toBe('PENDIENTE_RECUPERACION');
  });

  it('sin notas anuales no se decide', () => {
    const r = evaluarPromocion(entrada([asig('a', null), asig('b', 4)]), politica([]), 'CIERRE');
    expect(r.resultado).toBe('INCOMPLETO');
    expect(r.sin_nota).toEqual(['a']);
  });

  it('una regla limitada a un nivel no aplica a otro', () => {
    const pol = politica([regla({ clave: 'solo-media', niveles: ['MEDIA'], condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: 1, filtro: 'TODAS' }], accion: 'NO_PROMUEVE' })]);
    expect(evaluarPromocion(entrada([asig('a', 2)]), pol, 'CIERRE').resultado).toBe('PENDIENTE_RECUPERACION');
    expect(evaluarPromocion(entrada([asig('a', 2)], { nivel: 'MEDIA' }), pol, 'CIERRE').resultado).toBe('NO_PROMOVIDO');
  });
});

describe('validarPolitica', () => {
  it('rechaza claves repetidas, reglas sin condiciones y recuperación fuera del cierre', () => {
    const c = [{ tipo: 'PERDIDAS_AL_MENOS' as const, n: 1, filtro: 'TODAS' as const }];
    expect(validarPolitica(politica([regla({ clave: 'x1', condiciones: c, accion: 'NO_PROMUEVE' }), regla({ clave: 'x1', condiciones: c, accion: 'NO_PROMUEVE' })]))).toMatch(/repetida/);
    expect(validarPolitica(politica([regla({ clave: 'x1', condiciones: [], accion: 'NO_PROMUEVE' })]))).toMatch(/condición/);
    expect(validarPolitica(politica([regla({ clave: 'x1', condiciones: c, accion: 'PENDIENTE_RECUPERACION' })]))).toMatch(/cierre/);
  });

  it('el arrastre exige decir qué asignaturas se pueden deber', () => {
    const p = politica([], { arrastre: { ...politicaInicial().arrastre, admite: true } });
    expect(validarPolitica(p)).toMatch(/Marca qué/);
    expect(validarPolitica({ ...p, asignaturas_arrastrables_ids: ['edfis'] })).toBeNull();
  });
});

describe('conceptoOficial (lo que lee M26)', () => {
  it('redacta aprobado, aprobado con pendiente y no aprobado', () => {
    expect(conceptoOficial('PROMOVIDO', 'Séptimo', 'Octavo')).toEqual({ concepto: 'APROBO', texto: 'APROBÓ el grado Séptimo y es PROMOVIDO al grado Octavo' });
    expect(conceptoOficial('PROMOVIDO_POR_RECUPERACION', 'Once', null)).toEqual({ concepto: 'APROBO', texto: 'APROBÓ el grado Once' });
    expect(conceptoOficial('PROMOVIDO_CON_ARRASTRE', 'Sexto', 'Séptimo', ['Educación Física'])?.texto).toMatch(/con pendiente: Educación Física/);
    expect(conceptoOficial('NO_PROMOVIDO', 'Séptimo', 'Octavo')).toEqual({ concepto: 'NO_APROBO', texto: 'NO APROBÓ el grado Séptimo' });
  });

  it('un resultado que aún puede cambiar no es un concepto oficial', () => {
    for (const r of ['PENDIENTE_RECUPERACION', 'EN_COMISION', 'RETIRO_PROPUESTO', 'INCOMPLETO'] as const) expect(conceptoOficial(r, 'Sexto', 'Séptimo')).toBeNull();
  });
});
