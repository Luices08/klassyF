import { describe, expect, it } from 'vitest';
import { variablesDeTexto } from '../src/utils/plantillaCertificado';
// La lógica pura del editor de plantillas vive en el frontend (que no tiene ejecutor de pruebas): aquí se prueba contra el mismo patrón que usa el servidor.
import { aSegmentos, aTexto, limpiarPegado } from '../../frontend/src/lib/segmentosPlantilla';

describe('editor de plantillas: texto ↔ fichas', () => {
  it('ida y vuelta sin perder nada', () => {
    const texto = 'Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, cursa {{matricula.grado}}.';
    expect(aTexto(aSegmentos(texto))).toBe(texto);
  });

  it('parte en texto y variables, en orden', () => {
    expect(aSegmentos('Hola {{a.b}} y {{c}}!')).toEqual([
      { tipo: 'texto', texto: 'Hola ' },
      { tipo: 'variable', clave: 'a.b' },
      { tipo: 'texto', texto: ' y ' },
      { tipo: 'variable', clave: 'c' },
      { tipo: 'texto', texto: '!' },
    ]);
    expect(aSegmentos('')).toEqual([]);
    expect(aSegmentos('{{solo.una}}')).toEqual([{ tipo: 'variable', clave: 'solo.una' }]);
  });

  it('normaliza los espacios dentro de las llaves, igual que el servidor', () => {
    expect(aTexto(aSegmentos('{{  institucion.nombre }}'))).toBe('{{institucion.nombre}}');
  });

  it('las llaves mal cerradas quedan como texto: el servidor las rechaza al publicar', () => {
    expect(aSegmentos('Que {{estudiante.nombre')).toEqual([{ tipo: 'texto', texto: 'Que {{estudiante.nombre' }]);
    expect(aSegmentos('{{Mayuscula}}')).toEqual([{ tipo: 'texto', texto: '{{Mayuscula}}' }]);
  });

  it('reconoce exactamente las mismas variables que el servidor', () => {
    for (const texto of ['{{a}} {{b.c}} {{ d.e_f }}', 'sin variables', '{{x}}{{y}}', '{{1mal}} {{ok_1.dato}}']) {
      expect(aSegmentos(texto).flatMap((s) => (s.tipo === 'variable' ? [s.clave] : []))).toEqual(variablesDeTexto(texto));
    }
  });

  it('lo pegado queda en una sola línea', () => {
    expect(limpiarPegado('Primera\n  segunda\r\ntercera cuarta')).toBe('Primera segunda tercera cuarta');
  });
});
