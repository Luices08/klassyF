import { describe, expect, it } from 'vitest';
import { calcularQuorum, hashDeActa, periodicidadDelComite, quorumDeCaso, serializacionEstable } from '../src/utils/comiteConvivencia';

describe('calcularQuorum', () => {
  it('exige el porcentaje de presentes sobre el total de miembros', () => {
    expect(calcularQuorum(5, 3, 51).alcanzado).toBe(true);
    expect(calcularQuorum(5, 2, 51).alcanzado).toBe(false);
    expect(calcularQuorum(4, 2, 51).alcanzado).toBe(false);
    expect(calcularQuorum(4, 3, 51).alcanzado).toBe(true);
  });

  it('sin miembros o sin presentes no hay quórum, aunque el porcentaje sea bajo', () => {
    expect(calcularQuorum(0, 0, 1).alcanzado).toBe(false);
    expect(calcularQuorum(5, 0, 1).alcanzado).toBe(false);
  });

  it('el porcentaje es política: con 100 deben estar todos', () => {
    expect(calcularQuorum(5, 4, 100).alcanzado).toBe(false);
    expect(calcularQuorum(5, 5, 100).alcanzado).toBe(true);
  });
});

describe('quorumDeCaso', () => {
  const asistentes = [
    { miembro_id: 'a', asistio: true },
    { miembro_id: 'b', asistio: true },
    { miembro_id: 'c', asistio: true },
    { miembro_id: 'd', asistio: false },
    { miembro_id: 'e', asistio: false },
  ];

  it('sin recusados es igual al de la sesión', () => {
    expect(quorumDeCaso(asistentes, [], 51)).toMatchObject({ total_miembros: 5, presentes: 3, alcanzado: true });
  });

  it('el recusado no cuenta como miembro ni como presente, aunque haya asistido', () => {
    expect(quorumDeCaso(asistentes, ['a'], 51)).toMatchObject({ total_miembros: 4, presentes: 2, alcanzado: false });
    expect(quorumDeCaso(asistentes, ['d'], 51)).toMatchObject({ total_miembros: 4, presentes: 3, alcanzado: true });
  });
});

describe('hashDeActa', () => {
  it('es estable frente al orden de las claves y cambia si cambia el contenido', () => {
    const a = { fecha: new Date('2026-03-02T00:00:00Z'), asistentes: [{ nombre: 'Ana', asistio: true }], desarrollo: 'Texto' };
    const mismoContenido = { desarrollo: 'Texto', asistentes: [{ asistio: true, nombre: 'Ana' }], fecha: new Date('2026-03-02T00:00:00Z') };
    expect(hashDeActa(a)).toBe(hashDeActa(mismoContenido));
    expect(hashDeActa(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeActa({ ...a, desarrollo: 'Texto modificado' })).not.toBe(hashDeActa(a));
  });

  it('ignora campos indefinidos y conserva el orden de las listas', () => {
    expect(serializacionEstable({ a: 1, b: undefined })).toBe(serializacionEstable({ a: 1 }));
    expect(hashDeActa({ lista: [1, 2] })).not.toBe(hashDeActa({ lista: [2, 1] }));
  });
});

describe('periodicidadDelComite (Decreto 1965, art. 23)', () => {
  const dia = (s: string) => new Date(`${s}T00:00:00Z`);
  const ordinaria = (fecha: string, estado = 'FIRMADA') => ({ tipo: 'ORDINARIA', fecha: dia(fecha), estado });

  it('sin sesiones cuenta desde el inicio del año y vence a los dos meses', () => {
    expect(periodicidadDelComite([], dia('2026-03-15'), dia('2026-01-10'))).toMatchObject({ ultima_ordinaria: null, vencida: true });
    expect(periodicidadDelComite([], dia('2026-03-15'), dia('2026-02-01'))).toMatchObject({ vencida: false });
  });

  it('cuenta desde la última ordinaria realizada y no considera las anuladas ni las extraordinarias', () => {
    const sesiones = [ordinaria('2026-01-10'), ordinaria('2026-02-20', 'ANULADA'), { tipo: 'EXTRAORDINARIA', fecha: dia('2026-03-01'), estado: 'FIRMADA' }];
    const p = periodicidadDelComite(sesiones, dia('2026-03-09'), dia('2026-01-01'));
    expect(p.ultima_ordinaria).toEqual(dia('2026-01-10'));
    expect(p.limite).toEqual(dia('2026-03-10'));
    expect(p.vencida).toBe(false);
    expect(periodicidadDelComite(sesiones, dia('2026-03-11'), dia('2026-01-01')).vencida).toBe(true);
  });

  it('una ordinaria convocada para más adelante se informa pero no salva el plazo', () => {
    const p = periodicidadDelComite([ordinaria('2026-01-10'), ordinaria('2026-04-01', 'BORRADOR')], dia('2026-03-20'), null);
    expect(p).toMatchObject({ vencida: true, proxima_programada: dia('2026-04-01') });
  });

  it('sin sesiones ni inicio de año no puede decir que está vencida', () => {
    expect(periodicidadDelComite([], dia('2026-03-20'), null)).toMatchObject({ limite: null, vencida: false });
  });
});
