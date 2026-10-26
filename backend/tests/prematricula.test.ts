import { describe, expect, it } from 'vitest';
import { calcularCupos, decidirReserva, reservaVigente, ventanaAbierta } from '../src/utils/prematricula';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// Un instante a mediodía de Colombia (17:00 UTC).
const mediodia = (iso: string) => new Date(`${iso}T17:00:00.000Z`);

describe('ventanaAbierta (prematrícula)', () => {
  const ventana = { desde: dia('2026-10-01'), hasta: dia('2026-11-30') };

  it('abre el primer día y cierra el último, ambos incluidos', () => {
    expect(ventanaAbierta(ventana, mediodia('2026-10-01'))).toBe(true);
    expect(ventanaAbierta(ventana, mediodia('2026-11-30'))).toBe(true);
    expect(ventanaAbierta(ventana, new Date('2026-12-01T04:59:00.000Z'))).toBe(true); // 23:59 del 30 de noviembre en Colombia
  });

  it('antes de abrir y después de cerrar está cerrada', () => {
    expect(ventanaAbierta(ventana, mediodia('2026-09-30'))).toBe(false);
    expect(ventanaAbierta(ventana, new Date('2026-12-01T05:00:00.000Z'))).toBe(false); // ya es 1 de diciembre en Colombia
  });

  it('cuenta el día en hora de Colombia: a las 7 p.m. del 30 de septiembre aún no abre', () => {
    expect(ventanaAbierta(ventana, new Date('2026-10-01T00:30:00.000Z'))).toBe(false); // 19:30 del 30 de septiembre en Colombia
  });
});

describe('reservaVigente', () => {
  it('sin fecha límite no vence', () => {
    expect(reservaVigente(null, mediodia('2030-01-01'))).toBe(true);
  });

  it('vale hasta el último día para matricular, inclusive', () => {
    expect(reservaVigente(dia('2027-01-31'), mediodia('2027-01-31'))).toBe(true);
    expect(reservaVigente(dia('2027-01-31'), mediodia('2027-02-01'))).toBe(false);
  });
});

describe('calcularCupos', () => {
  const sexto = { grade_id: 'g6', sede_id: 's1', jornada_id: 'j1' };
  const grupos = [
    { ...sexto, max_capacity: 30, cupos_ocupados: 20 },
    { ...sexto, max_capacity: 30, cupos_ocupados: 25 },
    { grade_id: 'g7', sede_id: 's1', jornada_id: 'j1', max_capacity: 35, cupos_ocupados: 0 },
  ];

  it('suma la capacidad y lo ocupado de los grupos paralelos de un grado, sede y jornada', () => {
    const [fila] = calcularCupos(grupos, [], []);
    expect(fila).toMatchObject({ ...sexto, capacidad: 60, ocupados: 45, reservados: 0, en_espera: 0, libres: 15 });
  });

  it('las reservas vigentes restan cupo y las esperas se cuentan aparte', () => {
    const filas = calcularCupos(grupos, [sexto, sexto, sexto], [sexto]);
    expect(filas.find((f) => f.grade_id === 'g6')).toMatchObject({ reservados: 3, en_espera: 1, libres: 12 });
    expect(filas.find((f) => f.grade_id === 'g7')).toMatchObject({ reservados: 0, libres: 35 });
  });

  it('quien confirmó que continúa resta cupo y se cuenta aparte de las reservas', () => {
    const filas = calcularCupos(grupos, [sexto], [], [sexto, sexto]);
    expect(filas.find((f) => f.grade_id === 'g6')).toMatchObject({ reservados: 1, continuan: 2, libres: 12 });
    expect(filas.find((f) => f.grade_id === 'g7')).toMatchObject({ continuan: 0, libres: 35 });
    expect(calcularCupos(grupos, [], [], [{ grade_id: 'g9', sede_id: 's1', jornada_id: 'j1' }])).toHaveLength(2);
  });

  it('distingue la jornada: la mañana llena no resta a la tarde', () => {
    const tarde = { ...sexto, jornada_id: 'j2' };
    const filas = calcularCupos([...grupos, { ...tarde, max_capacity: 30, cupos_ocupados: 0 }], [sexto], []);
    expect(filas.find((f) => f.jornada_id === 'j1' && f.grade_id === 'g6')!.libres).toBe(14);
    expect(filas.find((f) => f.jornada_id === 'j2')!.libres).toBe(30);
  });

  it('puede quedar en negativo si se aprobaron más de los que cabían, y una cubeta sin grupos no aparece', () => {
    const [fila] = calcularCupos([{ ...sexto, max_capacity: 10, cupos_ocupados: 10 }], [sexto, sexto], []);
    expect(fila!.libres).toBe(-2);
    expect(calcularCupos(grupos, [{ grade_id: 'g9', sede_id: 's1', jornada_id: 'j1' }], [])).toHaveLength(2);
  });
});

describe('decidirReserva', () => {
  it('con cupo libre y nadie esperando antes, se reserva', () => {
    expect(decidirReserva(3, 0)).toEqual({ accion: 'RESERVAR', motivo: '' });
  });

  it('sin cupo libre, espera', () => {
    expect(decidirReserva(0, 0)).toMatchObject({ accion: 'ESPERAR', motivo: expect.stringMatching(/sin cupos libres|no tienen cupos libres/) });
    expect(decidirReserva(-1, 0).accion).toBe('ESPERAR');
  });

  it('aunque haya cupo, nadie se salta la fila: si hay quien se inscribió antes y espera, esta también espera', () => {
    const d = decidirReserva(5, 2);
    expect(d.accion).toBe('ESPERAR');
    expect(d.motivo).toMatch(/Antes hay 2 solicitudes en espera/);
    expect(decidirReserva(5, 1).motivo).toMatch(/Antes hay 1 solicitud en espera/);
  });
});
