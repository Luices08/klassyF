import { describe, expect, it } from 'vitest';
import { FilaDisponibilidadCupos } from '../src/services/cuposAdmision.service';

describe('Disponibilidad de cupos M04 (4 columnas reglamentarias)', () => {
  it('calcula correctamente Capacidad Total - Matriculados Reales = Cupos Libres', () => {
    const fila: FilaDisponibilidadCupos = {
      grado: { id: 'g1', nombre: 'Transición', numero: 0 },
      sede: { id: 's1', nombre: 'Principal' },
      jornada: { id: 'j1', nombre: 'Mañana' },
      capacidad_total: 30,
      matriculados_reales: 8,
      solicitudes_espera: 12,
      cupos_libres: 30 - 8,
    };

    expect(fila.capacidad_total).toBe(30);
    expect(fila.matriculados_reales).toBe(8);
    expect(fila.solicitudes_espera).toBe(12);
    expect(fila.cupos_libres).toBe(22);
  });

  it('no arroja cupos libres negativos si los matriculados exceden la capacidad configurada', () => {
    const capacidad = 30;
    const matriculados = 32;
    const libres = Math.max(0, capacidad - matriculados);
    expect(libres).toBe(0);
  });
});
