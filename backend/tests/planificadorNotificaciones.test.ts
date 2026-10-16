import { describe, expect, it } from 'vitest';
import { diaDeColombia } from '../src/services/planificadorNotificaciones.service';

describe('planificador de notificaciones', () => {
  it('el día se cuenta en hora de Colombia', () => {
    expect(diaDeColombia(new Date('2026-10-16T04:59:00Z'))).toBe('2026-10-15');
    expect(diaDeColombia(new Date('2026-10-16T05:00:00Z'))).toBe('2026-10-16');
  });
});
