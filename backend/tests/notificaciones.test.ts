import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { pestanaDeHijo } from '../src/constants/notificaciones';
import { renderizarNotificacion } from '../src/utils/notificaciones';

describe('renderizarNotificacion', () => {
  it('cambia el texto según cuántas entregas se acumularon', () => {
    expect(renderizarNotificacion('ENTREGA_NUEVA', 1, { actividad: 'Fraccionarios' }).mensaje).toBe('Tienes 1 entrega nueva en la actividad «Fraccionarios».');
    expect(renderizarNotificacion('ENTREGA_NUEVA', 145, { actividad: 'Fraccionarios' }).mensaje).toContain('145 entregas nuevas');
  });

  it('el aviso de falta grave no revela hechos ni a otros involucrados', () => {
    const { mensaje } = renderizarNotificacion('FALTA_GRAVE', 1, { estudiante: 'Ana', motivo: 'agresión' });
    expect(mensaje).not.toContain('agresión');
  });

  it('el cierre de periodo habla en singular y en el mismo día', () => {
    expect(renderizarNotificacion('CIERRE_PERIODO_PROXIMO', 1, { periodo: 2, dias: 1 }).mensaje).toContain('en 1 día');
    expect(renderizarNotificacion('CIERRE_PERIODO_PROXIMO', 1, { periodo: 2, dias: 0 }).mensaje).toContain('hoy');
  });

  it('las inasistencias nuevas se cuentan en singular y plural', () => {
    expect(renderizarNotificacion('INASISTENCIA_REGISTRADA', 1, { estudiante: 'Ana Pérez' }).mensaje).toContain('Se registró 1 inasistencia nueva de Ana Pérez');
    expect(renderizarNotificacion('INASISTENCIA_REGISTRADA', 3, {}).mensaje).toContain('Se registraron 3 inasistencias nuevas');
  });

  it('la justificación rechazada lleva el motivo y la aprobada no', () => {
    expect(renderizarNotificacion('JUSTIFICACION_REVISADA', 1, { decision: 'RECHAZADA', motivo: 'Sin soporte' }).mensaje).toContain('rechazó');
    expect(renderizarNotificacion('JUSTIFICACION_REVISADA', 1, { decision: 'RECHAZADA', motivo: 'Sin soporte' }).mensaje).toContain('Sin soporte');
    expect(renderizarNotificacion('JUSTIFICACION_REVISADA', 1, { decision: 'APROBADA', motivo: 'x' }).mensaje).not.toContain('Motivo');
  });

  it('los recordatorios del calendario hablan de hoy o de los días que faltan', () => {
    expect(renderizarNotificacion('RECORDATORIO_CALENDARIO', 1, { nombre: 'Recuperación del periodo 1', dias: 0 }).mensaje).toBe('Recuperación del periodo 1 es hoy.');
    expect(renderizarNotificacion('RECORDATORIO_CALENDARIO', 1, { nombre: 'Jornada pedagógica', dias: 2 }).mensaje).toContain('empieza en 2 días');
  });
});

describe('pestanaDeHijo', () => {
  it('cabe en lo que acepta el validador de «visto» (minúsculas, números y guiones, hasta 40)', () => {
    for (const pestana of ['inasistencias', 'convivencia', 'documentos']) {
      expect(pestanaDeHijo(pestana, new Types.ObjectId())).toMatch(/^[a-z0-9-]{1,40}$/);
    }
  });
});
