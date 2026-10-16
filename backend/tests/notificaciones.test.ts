import { describe, expect, it } from 'vitest';
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
});
