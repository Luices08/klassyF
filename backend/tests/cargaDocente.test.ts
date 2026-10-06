import { describe, expect, it } from 'vitest';
import { diagnosticarCarga, resumirCargaDocente } from '../src/dominios/curricular/carga-docente/cargaDocente';

const limites = { PREESCOLAR: 20, PRIMARIA: 25, SECUNDARIA: 22, MEDIA: 22 };
const tolerancia = 2;

const diagnosticar = (horasPorNivel: Parameters<typeof diagnosticarCarga>[0]['horasPorNivel'], horasOtras = 0) =>
  diagnosticarCarga({ horasPorNivel, horasOtras, limites, toleranciaSubcargaHoras: tolerancia });

describe('diagnosticarCarga', () => {
  it('sin horas por nivel no supone ningún nivel ni tope', () => {
    expect(diagnosticar({})).toEqual({
      nivel_predominante: null,
      tope_horas: null,
      fraccion_carga: null,
      estado_carga: 'SIN_CARGA',
    });
  });

  it('un solo nivel se mide contra el tope de ese nivel', () => {
    expect(diagnosticar({ SECUNDARIA: 22 }).estado_carga).toBe('NORMAL');
    expect(diagnosticar({ SECUNDARIA: 23 }).estado_carga).toBe('SOBRE_CARGA');
    expect(diagnosticar({ SECUNDARIA: 20 }).estado_carga).toBe('NORMAL');
    expect(diagnosticar({ SECUNDARIA: 19 }).estado_carga).toBe('SUB_CARGA');
    expect(diagnosticar({ PRIMARIA: 25 })).toMatchObject({ nivel_predominante: 'PRIMARIA', tope_horas: 25 });
  });

  it('varios niveles se miden como fracción de la jornada, no contra un solo tope', () => {
    const resultado = diagnosticar({ PRIMARIA: 14, SECUNDARIA: 10 });
    expect(resultado.nivel_predominante).toBe('MULTINIVEL');
    expect(resultado.fraccion_carga).toBeCloseTo(14 / 25 + 10 / 22, 10);
    expect(resultado.estado_carga).toBe('SOBRE_CARGA');
  });

  it('no marca sobrecarga por error de decimales cuando la fracción es exactamente 1', () => {
    expect(diagnosticar({ SECUNDARIA: 11, MEDIA: 11 }).estado_carga).toBe('NORMAL');
  });

  it('las horas sueltas (proyectos) cuentan contra el tope promedio', () => {
    expect(diagnosticar({ SECUNDARIA: 10 }, 4).fraccion_carga).toBeCloseTo(14 / 22, 10);
  });

  it('la tolerancia de subcarga es configurable', () => {
    const con = (toleranciaSubcargaHoras: number) =>
      diagnosticarCarga({ horasPorNivel: { SECUNDARIA: 19 }, horasOtras: 0, limites, toleranciaSubcargaHoras });
    expect(con(2).estado_carga).toBe('SUB_CARGA');
    expect(con(3).estado_carga).toBe('NORMAL');
  });
});

describe('resumirCargaDocente', () => {
  it('la dirección de grupo sin horas no suma y no inventa carga', () => {
    const resumen = resumirCargaDocente(
      [{ tipo_asignacion: 'DIRECCION_GRUPO', horas_semanales: 0, nivel: 'SECUNDARIA' }],
      limites,
      tolerancia
    );
    expect(resumen).toMatchObject({ tiene_direccion_grupo: true, horas_totales: 0, estado_carga: 'SIN_CARGA' });
  });

  it('la dirección con horas cuenta en el nivel del grupo dirigido junto a sus clases', () => {
    const resumen = resumirCargaDocente(
      [
        { tipo_asignacion: 'CLASE', horas_semanales: 20, nivel: 'SECUNDARIA' },
        { tipo_asignacion: 'DIRECCION_GRUPO', horas_semanales: 3, nivel: 'SECUNDARIA' },
      ],
      limites,
      tolerancia
    );
    expect(resumen).toMatchObject({
      horas_clase: 20,
      horas_direccion: 3,
      horas_totales: 23,
      nivel_predominante: 'SECUNDARIA',
      estado_carga: 'SOBRE_CARGA',
    });
  });

  it('un docente con solo proyectos queda sin carga lectiva, no medido contra un nivel supuesto', () => {
    const resumen = resumirCargaDocente(
      [{ tipo_asignacion: 'PROYECTO_TRANSVERSAL', horas_semanales: 6 }],
      limites,
      tolerancia
    );
    expect(resumen).toMatchObject({ horas_proyectos: 6, nivel_predominante: null, estado_carga: 'SIN_CARGA' });
  });

  it('una clase sin nivel conocido no se pierde del total: se mide como hora suelta', () => {
    const resumen = resumirCargaDocente(
      [
        { tipo_asignacion: 'CLASE', horas_semanales: 10, nivel: 'SECUNDARIA' },
        { tipo_asignacion: 'CLASE', horas_semanales: 4 },
      ],
      limites,
      tolerancia
    );
    expect(resumen.horas_totales).toBe(14);
    expect(resumen.fraccion_carga).toBeCloseTo(14 / 22, 10);
  });
});
