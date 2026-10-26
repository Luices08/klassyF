import { describe, expect, it } from 'vitest';
import { resolverNombre } from '../src/utils/nombres';

describe('resolverNombre', () => {
  it('arma el nombre y el apellido de las cuatro partes', () => {
    expect(resolverNombre({ primer_nombre: 'Andrés', segundo_nombre: 'Damian', primer_apellido: 'Cardenas', segundo_apellido: 'Suarez' })).toEqual({
      nombre: 'Andrés Damian',
      apellido: 'Cardenas Suarez',
      partes: { primer_nombre: 'Andrés', segundo_nombre: 'Damian', primer_apellido: 'Cardenas', segundo_apellido: 'Suarez' },
    });
  });

  it('los segundos son opcionales y se limpian los espacios, sin tocar mayúsculas ni tildes', () => {
    expect(resolverNombre({ primer_nombre: ' María ', segundo_nombre: '  ', primer_apellido: 'De   la Cruz', segundo_apellido: null })).toEqual({
      nombre: 'María',
      apellido: 'De la Cruz',
      partes: { primer_nombre: 'María', primer_apellido: 'De la Cruz' },
    });
  });

  it('nunca parte un nombre completo: sin las partes usa el nombre y el apellido tal cual, y sin nada es null', () => {
    expect(resolverNombre({ nombre: 'Ana María', apellido: 'Pérez Gómez' })).toEqual({ nombre: 'Ana María', apellido: 'Pérez Gómez', partes: {} });
    expect(resolverNombre({ primer_nombre: 'Ana' })).toBeNull();
    expect(resolverNombre({ primer_apellido: 'Pérez', nombre: 'Ana' })).toBeNull();
    expect(resolverNombre({})).toBeNull();
  });

  it('las cuatro partes mandan sobre el nombre completo si llegan las dos formas', () => {
    expect(resolverNombre({ primer_nombre: 'Ana', primer_apellido: 'Pérez', nombre: 'Otro', apellido: 'Distinto' })?.nombre).toBe('Ana');
  });
});
