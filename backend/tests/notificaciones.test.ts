import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { pestanaDeAsignatura, pestanaDeClase, pestanaDeHijo } from '../src/constants/notificaciones';
import { renderizarNotificacion } from '../src/utils/notificaciones';

describe('renderizarNotificacion', () => {
  it('cambia el texto según cuántas entregas se acumularon', () => {
    expect(renderizarNotificacion('ENTREGA_NUEVA', 1, { actividad: 'Fraccionarios' }).mensaje).toBe('Tienes 1 entrega nueva en la actividad «Fraccionarios».');
    expect(renderizarNotificacion('ENTREGA_NUEVA', 145, { actividad: 'Fraccionarios' }).mensaje).toContain('145 entregas nuevas');
    expect(renderizarNotificacion('ENTREGA_NUEVA', 2, { actividad: 'Fraccionarios', grupo: '10-A' }).mensaje).toBe('Tienes 2 entregas nuevas en la actividad «Fraccionarios» del grupo 10-A.');
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

describe('pestanas de clase y de asignatura (puntos rojos de los botones del catálogo)', () => {
  it('son únicas por clase o asignatura y caben en lo que acepta el validador de «visto»', () => {
    const id = new Types.ObjectId();
    expect(pestanaDeClase(id)).toBe(`clase-${id}`);
    expect(pestanaDeAsignatura(id)).toBe(`pendientes-${id}`);
    expect(pestanaDeClase(id)).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(pestanaDeAsignatura(id)).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe('textos de las recuperaciones (M18)', () => {
  const ventana = { tipo_recuperacion: 'PERIODO' as const, periodo: 2, cuando: 'del 22/10 al 13/11' };

  it('las fechas, el inicio y «mañana termina» se dicen al docente con cuántos estudiantes tiene por recuperar', () => {
    expect(renderizarNotificacion('RECUPERACION_FECHAS', 1, { ...ventana, cantidad: 3 }).mensaje).toBe('La recuperación del periodo 2 del 22/10 al 13/11. Tienes 3 estudiantes por recuperar.');
    expect(renderizarNotificacion('RECUPERACION_FECHAS', 1, ventana).mensaje).toBe('La recuperación del periodo 2 del 22/10 al 13/11.');
    expect(renderizarNotificacion('RECUPERACION_INICIA', 1, { ...ventana, cantidad: 1 }).mensaje).toBe(
      'La recuperación del periodo 2 empieza hoy y va del 22/10 al 13/11. Tienes 1 estudiante por recuperar.'
    );
    expect(renderizarNotificacion('RECUPERACION_TERMINA_MANANA', 1, { ...ventana, cantidad: 2 }).mensaje).toBe(
      'La recuperación del periodo 2 termina mañana. Aún tienes 2 estudiantes sin superarla.'
    );
  });

  it('la de fin de año se nombra distinto', () => {
    expect(renderizarNotificacion('RECUPERACION_INICIA', 1, { tipo_recuperacion: 'ANUAL', cuando: 'del 07/12 al 11/12', cantidad: 2 }).mensaje).toContain('La recuperación de fin de año empieza hoy');
  });

  it('al estudiante se le habla en segunda persona y a la familia con el nombre del estudiante', () => {
    expect(renderizarNotificacion('RECUPERACION_HABILITADA', 1, { ...ventana, cantidad: 2 }).mensaje).toBe(
      'Tienes 2 asignaturas por recuperar: la recuperación del periodo 2 va del 22/10 al 13/11. Habla con tu docente.'
    );
    expect(renderizarNotificacion('RECUPERACION_HABILITADA', 1, { ...ventana, cantidad: 1, estudiante: 'Julián Cardona' }).mensaje).toContain('Julián Cardona tiene 1 asignatura por recuperar');
  });

  it('el resultado dice la nota anterior y la nueva, y si la superó o cuántos intentos quedan', () => {
    const base = { asignatura: 'Ciencias Naturales', nota_anterior: 2.06, nota_nueva: 3.2 };
    expect(renderizarNotificacion('RECUPERACION_REGISTRADA', 1, { ...base, superada: true }).mensaje).toBe(
      'Se registró tu recuperación de Ciencias Naturales: nota anterior 2.06, recuperación 3.20; la superó.'
    );
    expect(renderizarNotificacion('RECUPERACION_REGISTRADA', 1, { ...base, nota_nueva: 2.5, superada: false, intentos_restantes: 1 }).mensaje).toContain('no la superó, te queda 1 intento');
    expect(renderizarNotificacion('RECUPERACION_REGISTRADA', 1, { ...base, nota_nueva: 2.5, superada: false, intentos_restantes: 0, estudiante: 'Ana' }).mensaje).toBe(
      'Se registró la recuperación de Ana en Ciencias Naturales: nota anterior 2.06, recuperación 2.50; no la superó.'
    );
  });

  it('varios resultados sin leer se resumen sin repetir cada nota', () => {
    expect(renderizarNotificacion('RECUPERACION_REGISTRADA', 3, { estudiante: 'Ana' }).mensaje).toBe('Se registraron 3 resultados de recuperación de Ana. Revisa las notas para ver cómo quedaron.');
  });
});
