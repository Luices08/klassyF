import { describe, expect, it } from 'vitest';
import { ResultadoPromocion } from '../src/constants/promocion';
import { compararGradoElegido, ubicarEstudiante, DatosUbicacion } from '../src/utils/ubicacionEstudiante';

const GRADOS = new Set([-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const base: DatosUbicacion = { matriculaDelAnio: null, previa: null, gradosExistentes: GRADOS, perfilGraduado: false };
const previa = (gradoNumero: number, resultado: ResultadoPromocion | null, extra: Partial<NonNullable<DatosUbicacion['previa']>> = {}) => ({
  gradoNumero,
  estado: 'MATRICULADO_DEFINITIVO' as const,
  resultado,
  noRenueva: false,
  ...extra,
});

describe('ubicarEstudiante', () => {
  it('quien terminó 5° promovido aparece en 6°', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'PROMOVIDO') });
    expect(u).toMatchObject({ lugar: 'GRADO', grado_numero: 6, fuente: 'PROMOCION', difiere: false, ultimo_grado_cursado: 5 });
  });

  it('el no promovido repite su grado', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'NO_PROMOVIDO') });
    expect(u).toMatchObject({ lugar: 'GRADO', grado_numero: 5, fuente: 'PROMOCION' });
  });

  it('quien termina 11° promovido es egresado: no aparece en ningún grado', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(11, 'PROMOVIDO') });
    expect(u).toMatchObject({ lugar: 'EGRESADO', grado_numero: null, ultimo_grado_cursado: 11 });
  });

  it('el estudiante de 11° no promovido sigue en 11°', () => {
    expect(ubicarEstudiante({ ...base, previa: previa(11, 'NO_PROMOVIDO') })).toMatchObject({ lugar: 'GRADO', grado_numero: 11 });
  });

  it('la promoción por recuperación o con arrastre también sube de grado', () => {
    expect(ubicarEstudiante({ ...base, previa: previa(3, 'PROMOVIDO_POR_RECUPERACION') }).grado_numero).toBe(4);
    expect(ubicarEstudiante({ ...base, previa: previa(3, 'PROMOVIDO_CON_ARRASTRE') }).grado_numero).toBe(4);
  });

  it('un cierre pendiente (recuperación, comisión) se trata como sin cierre: propone el siguiente', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(7, 'PENDIENTE_RECUPERACION') });
    expect(u).toMatchObject({ lugar: 'GRADO', grado_numero: 8, fuente: 'PROPUESTA' });
    expect(u.aviso).toMatch(/no tiene cierre/i);
  });

  it('sin cierre de promoción propone el siguiente; en 11° pide confirmar', () => {
    expect(ubicarEstudiante({ ...base, previa: previa(4, null) })).toMatchObject({ grado_numero: 5, fuente: 'PROPUESTA' });
    expect(ubicarEstudiante({ ...base, previa: previa(11, null) })).toMatchObject({ lugar: 'EGRESADO', fuente: 'PROPUESTA' });
  });

  it('quien se retiró en un año anterior vuelve a ese grado, aunque tenga un cierre', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(6, null, { estado: 'RETIRADO' }) });
    expect(u).toMatchObject({ lugar: 'GRADO', grado_numero: 6, fuente: 'RETIRO_PREVIO' });
  });

  it('no_renueva_cupo no cambia el grado, solo avisa', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'PROMOVIDO', { noRenueva: true }) });
    expect(u.grado_numero).toBe(6);
    expect(u.aviso).toMatch(/no renovar/i);
  });

  it('sin historial queda sin grado registrado', () => {
    expect(ubicarEstudiante(base)).toMatchObject({ lugar: 'SIN_GRADO', grado_numero: null, fuente: 'SIN_HISTORIAL', ultimo_grado_cursado: null });
  });

  it('el expediente GRADUADO lo manda a egresados', () => {
    expect(ubicarEstudiante({ ...base, perfilGraduado: true, previa: previa(10, 'PROMOVIDO') }).lugar).toBe('EGRESADO');
  });

  it('matriculado por decisión en otro grado aparece donde está y marca que difiere', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'NO_PROMOVIDO'), matriculaDelAnio: { gradoNumero: 6, estado: 'MATRICULADO_DEFINITIVO' } });
    expect(u).toMatchObject({ lugar: 'GRADO', grado_numero: 6, fuente: 'MATRICULA_ACTUAL', difiere: true });
    expect(u.esperado).toEqual({ lugar: 'GRADO', grado_numero: 5 });
  });

  it('matriculado donde manda el historial no difiere', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'PROMOVIDO'), matriculaDelAnio: { gradoNumero: 6, estado: 'MATRICULADO_CONDICIONAL' } });
    expect(u.difiere).toBe(false);
  });

  it('matriculado sin historial no se marca como diferente', () => {
    expect(ubicarEstudiante({ ...base, matriculaDelAnio: { gradoNumero: 1, estado: 'MATRICULADO_DEFINITIVO' } }).difiere).toBe(false);
  });

  it('retirado este año: el reingreso vuelve al grado del que se retiró, aunque el historial dijera otro', () => {
    const u = ubicarEstudiante({ ...base, previa: previa(5, 'NO_PROMOVIDO'), matriculaDelAnio: { gradoNumero: 6, estado: 'RETIRADO' } });
    expect(u).toMatchObject({ grado_numero: 6, fuente: 'RETIRO_DEL_ANIO', difiere: false });
    expect(u.esperado).toEqual({ lugar: 'GRADO', grado_numero: 6 });
  });
});

describe('compararGradoElegido', () => {
  const esperado = { lugar: 'GRADO' as const, grado_numero: 6 };

  it('coincide con el grado esperado', () => {
    expect(compararGradoElegido({ gradoElegido: 6, esperado, gradosExistentes: GRADOS }).resultado).toBe('COINCIDE');
  });

  it('difiere cuando se elige otro grado', () => {
    expect(compararGradoElegido({ gradoElegido: 7, esperado, gradosExistentes: GRADOS })).toEqual({ resultado: 'DIFIERE', esperado: { lugar: 'GRADO', grado_numero: 6 } });
  });

  it('sin historial ni declaración no hay referencia', () => {
    expect(compararGradoElegido({ gradoElegido: 1, esperado: { lugar: 'SIN_GRADO', grado_numero: null }, gradosExistentes: GRADOS }).resultado).toBe('SIN_REFERENCIA');
  });

  it('el certificado de 5° declarado espera 6°: matricular en 1° difiere', () => {
    const v = compararGradoElegido({ gradoElegido: 1, esperado: { lugar: 'SIN_GRADO', grado_numero: null }, ultimoGradoAprobadoDeclarado: 5, gradosExistentes: GRADOS });
    expect(v).toEqual({ resultado: 'DIFIERE', esperado: { lugar: 'GRADO', grado_numero: 6 } });
  });

  it('el grado declarado manda sobre el historial', () => {
    expect(compararGradoElegido({ gradoElegido: 6, esperado: { lugar: 'GRADO', grado_numero: 3 }, ultimoGradoAprobadoDeclarado: 5, gradosExistentes: GRADOS }).resultado).toBe('COINCIDE');
  });

  it('con 11° aprobado declarado no hay grado siguiente: cualquier grado difiere', () => {
    expect(compararGradoElegido({ gradoElegido: 11, esperado: { lugar: 'SIN_GRADO', grado_numero: null }, ultimoGradoAprobadoDeclarado: 11, gradosExistentes: GRADOS })).toEqual({
      resultado: 'DIFIERE',
      esperado: { lugar: 'EGRESADO', grado_numero: null },
    });
  });

  it('un egresado que se matricula en cualquier grado difiere', () => {
    expect(compararGradoElegido({ gradoElegido: 11, esperado: { lugar: 'EGRESADO', grado_numero: null }, gradosExistentes: GRADOS }).resultado).toBe('DIFIERE');
  });
});
