import { describe, expect, it } from 'vitest';
import { motivoDeOfertaNoDisponible } from '../src/utils/ofertaDeAdmision';

const oferta = [
  { grado_id: 'g6', sede_id: 's1', jornada: 'MANANA' },
  { grado_id: 'g6', sede_id: 's2', jornada: 'TARDE' },
  { grado_id: 'g7', sede_id: 's1', jornada: 'TARDE' },
];

describe('motivoDeOfertaNoDisponible', () => {
  it('lo que existe se acepta, con o sin sede y jornada', () => {
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g6' })).toBeNull();
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g6', sede_id: 's1' })).toBeNull();
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g6', jornada: 'TARDE' })).toBeNull();
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g6', sede_id: 's2', jornada: 'TARDE' })).toBeNull();
  });

  it('un grado que no se ofrece en ninguna parte', () => {
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g9' })).toMatch(/grado no se ofrece por ahora/);
  });

  it('un grado que no está en la sede elegida', () => {
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g7', sede_id: 's2' })).toMatch(/en la sede elegida/);
  });

  it('un grado que no está en la jornada, con o sin sede', () => {
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g7', jornada: 'MANANA' })).toMatch(/en esa jornada\./);
    expect(motivoDeOfertaNoDisponible(oferta, { grado_id: 'g6', sede_id: 's1', jornada: 'TARDE' })).toMatch(/jornada en la sede elegida/);
  });

  it('sin ningún grupo abierto no se puede solicitar nada', () => {
    expect(motivoDeOfertaNoDisponible([], { grado_id: 'g6' })).toMatch(/aún no tiene grupos/);
  });
});
