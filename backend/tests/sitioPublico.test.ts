import { describe, expect, it } from 'vitest';
import { CONFIGURACION_SITIO_INICIAL, FUENTES_SITIO, PLANTILLAS_SITIO, SECCIONES_SITIO, plantillaDe } from '../src/constants/sitioPublico';
import { guardarConfiguracion } from '../src/validators/sitioPublico.validator';

describe('plantillas del sitio público', () => {
  it('cada plantilla declara al menos una ubicación de logo y de menú', () => {
    for (const p of PLANTILLAS_SITIO) {
      expect(p.logo.length).toBeGreaterThan(0);
      expect(p.menu.length).toBeGreaterThan(0);
    }
  });

  it('los ids son únicos', () => {
    const ids = PLANTILLAS_SITIO.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hay plantillas con y sin carrusel', () => {
    expect(PLANTILLAS_SITIO.some((p) => p.slider)).toBe(true);
    expect(PLANTILLAS_SITIO.some((p) => !p.slider)).toBe(true);
  });

  it('la configuración inicial es válida para su plantilla y para el validador', () => {
    const plantilla = plantillaDe(CONFIGURACION_SITIO_INICIAL.plantilla)!;
    expect(plantilla.logo).toContain(CONFIGURACION_SITIO_INICIAL.logo_posicion);
    expect(plantilla.menu).toContain(CONFIGURACION_SITIO_INICIAL.menu_posicion);
    expect(CONFIGURACION_SITIO_INICIAL.secciones.map((s) => s.clave)).toEqual([...SECCIONES_SITIO]);
    expect(FUENTES_SITIO).toContain(CONFIGURACION_SITIO_INICIAL.tipografia.fuente_titulo);
    const { error } = guardarConfiguracion.body!.validate(CONFIGURACION_SITIO_INICIAL);
    expect(error).toBeUndefined();
  });

  it('el validador rechaza colores que no son #RRGGBB y fuentes fuera de la lista', () => {
    const base = structuredClone(CONFIGURACION_SITIO_INICIAL);
    expect(guardarConfiguracion.body!.validate({ ...base, tipografia: { ...base.tipografia, color_texto: 'red' } }).error).toBeDefined();
    expect(guardarConfiguracion.body!.validate({ ...base, tipografia: { ...base.tipografia, fuente_texto: 'Comic Sans' } }).error).toBeDefined();
  });
});
