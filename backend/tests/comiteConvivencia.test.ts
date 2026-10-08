import { describe, expect, it } from 'vitest';
import { calcularQuorum, hashDeActa, quorumDeCaso, serializacionEstable } from '../src/utils/comiteConvivencia';

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
