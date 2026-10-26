import { describe, expect, it } from 'vitest';
import { sugerirGrupo } from '../src/utils/sugerenciaDeGrupo';

const g = (id: string, ocupados: number, max = 30, sede = 's1', jornada: string | null = 'j1') => ({ id, nombre: id, sede_id: sede, jornada_id: jornada, max_capacity: max, cupos_ocupados: ocupados });

describe('sugerirGrupo', () => {
  it('sugiere el menos lleno por porcentaje, no por cantidad', () => {
    expect(sugerirGrupo([g('601', 20, 30), g('602', 10, 15), g('603', 12, 30)])).toMatchObject({ id: '603', libres: 18, en_preferencia: true });
  });

  it('a igual ocupación prefiere el de más lugares libres y luego el nombre', () => {
    expect(sugerirGrupo([g('602', 10, 20), g('601', 15, 30)])?.id).toBe('601');
    expect(sugerirGrupo([g('602', 10, 20), g('601', 10, 20)])?.id).toBe('601');
  });

  it('no sugiere un grupo lleno y devuelve null si ninguno tiene cupo', () => {
    expect(sugerirGrupo([g('601', 30), g('602', 29)])?.id).toBe('602');
    expect(sugerirGrupo([g('601', 30), g('602', 30)])).toBeNull();
    expect(sugerirGrupo([])).toBeNull();
  });

  it('busca primero en la sede y jornada preferidas', () => {
    const grupos = [g('601', 5, 30, 's1', 'j1'), g('602', 25, 30, 's2', 'j2'), g('603', 0, 30, 's1', 'j2')];
    expect(sugerirGrupo(grupos, { sede_id: 's2', jornada_id: 'j2' })).toMatchObject({ id: '602', en_preferencia: true });
    expect(sugerirGrupo(grupos, { sede_id: 's1' })?.id).toBe('603');
  });

  it('si en la preferencia no queda cupo sugiere otro y lo marca', () => {
    const grupos = [g('601', 30, 30, 's1', 'j1'), g('602', 10, 30, 's2', 'j2')];
    expect(sugerirGrupo(grupos, { sede_id: 's1', jornada_id: 'j1' })).toMatchObject({ id: '602', en_preferencia: false });
  });
});
