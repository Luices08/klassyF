import { describe, expect, it } from 'vitest';
import { CLAVES_DOCUMENTO_PIAR, DOCUMENTOS_PIAR, ESTADOS_EXPEDIENTE } from '../src/dominios/bienestar/inclusion/inclusion.constants';
import {
  TRANSICIONES_EXPEDIENTE,
  ajusteCompleto,
  codigoDeDocumento,
  completitudDeAjustes,
  edadEnAnios,
  esMayorDeEdad,
  fechaLimiteElaboracion,
  firmanteRequerido,
  fusionarSeccion,
  pendientesParaAprobar,
  plazoVencido,
  puedeTransicionar,
  seguimientosFaltantes,
} from '../src/dominios/bienestar/inclusion/inclusion';

const ajuste = (extra: Partial<Parameters<typeof ajusteCompleto>[0]> = {}) => ({
  dba_ids: [],
  objetivo_flexibilizado: 'Comprender fracciones con material concreto',
  barrera_asignatura: 'No alcanza a leer el tablero',
  ajuste_metodologico: 'Material ampliado',
  ajuste_evaluativo: 'Sustentación oral',
  ...extra,
});

describe('transiciones del expediente', () => {
  it('cada estado tiene su fila y CERRADO es terminal', () => {
    expect(Object.keys(TRANSICIONES_EXPEDIENTE).sort()).toEqual([...ESTADOS_EXPEDIENTE].sort());
    expect(TRANSICIONES_EXPEDIENTE.CERRADO).toEqual([]);
  });

  it('solo se llega a ACTIVO desde LISTO_PARA_ACUERDO (la firma del acta)', () => {
    expect(puedeTransicionar('LISTO_PARA_ACUERDO', 'ACTIVO')).toBe(true);
    expect(puedeTransicionar('BORRADOR', 'ACTIVO')).toBe(false);
    expect(puedeTransicionar('EN_CONSTRUCCION', 'ACTIVO')).toBe(false);
  });

  it('un expediente aprobado puede devolverse a construcción; uno firmado ya solo se cierra', () => {
    expect(puedeTransicionar('LISTO_PARA_ACUERDO', 'EN_CONSTRUCCION')).toBe(true);
    expect(puedeTransicionar('ACTIVO', 'EN_CONSTRUCCION')).toBe(false);
    expect(puedeTransicionar('ACTIVO', 'CERRADO')).toBe(true);
  });
});

describe('plazo de elaboración', () => {
  const inicio = new Date('2026-02-02T00:00:00Z');

  it('cuenta los días desde el inicio del año', () => {
    expect(fechaLimiteElaboracion(inicio, null, 90).toISOString()).toBe('2026-05-03T00:00:00.000Z');
  });

  it('si la matrícula es posterior al inicio, cuenta desde la matrícula (matrícula extemporánea)', () => {
    expect(fechaLimiteElaboracion(inicio, new Date('2026-04-01T00:00:00Z'), 30).toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('una matrícula anterior al inicio del año no adelanta el plazo', () => {
    expect(fechaLimiteElaboracion(inicio, new Date('2025-11-01T00:00:00Z'), 10).toISOString()).toBe('2026-02-12T00:00:00.000Z');
  });

  it('vence solo mientras el expediente no esté firmado ni cerrado (alerta, no bloqueo)', () => {
    const limite = new Date('2026-05-01T00:00:00Z');
    const despues = new Date('2026-05-02T00:00:00Z');
    expect(plazoVencido(limite, 'EN_CONSTRUCCION', despues)).toBe(true);
    expect(plazoVencido(limite, 'ACTIVO', despues)).toBe(false);
    expect(plazoVencido(limite, 'CERRADO', despues)).toBe(false);
    expect(plazoVencido(limite, 'BORRADOR', new Date('2026-04-30T00:00:00Z'))).toBe(false);
    expect(plazoVencido(null, 'BORRADOR', despues)).toBe(false);
  });
});

describe('edad y firmante del acta', () => {
  it('calcula la edad cumplida y la mayoría de edad', () => {
    const nace = new Date('2008-06-15T00:00:00Z');
    expect(edadEnAnios(nace, new Date('2026-06-14T00:00:00Z'))).toBe(17);
    expect(edadEnAnios(nace, new Date('2026-06-15T00:00:00Z'))).toBe(18);
    expect(esMayorDeEdad(nace, new Date('2026-06-14T00:00:00Z'))).toBe(false);
    expect(esMayorDeEdad(nace, new Date('2026-06-15T00:00:00Z'))).toBe(true);
  });

  it('un menor lo firma su acudiente y un mayor de edad, él mismo', () => {
    expect(firmanteRequerido(false)).toBe('ACUDIENTE');
    expect(firmanteRequerido(true)).toBe('ESTUDIANTE');
  });
});

describe('completitud de los ajustes (Anexo 2)', () => {
  it('un ajuste está completo con objetivo (DBA o texto), barrera y los dos ajustes', () => {
    expect(ajusteCompleto(ajuste())).toBe(true);
    expect(ajusteCompleto(ajuste({ objetivo_flexibilizado: '', dba_ids: ['d1'] }))).toBe(true);
    expect(ajusteCompleto(ajuste({ objetivo_flexibilizado: '', dba_ids: [] }))).toBe(false);
    expect(ajusteCompleto(ajuste({ barrera_asignatura: '  ' }))).toBe(false);
    expect(ajusteCompleto(ajuste({ ajuste_evaluativo: '' }))).toBe(false);
  });

  it('mide contra las asignaturas del plan, no contra lo que haya guardado', () => {
    const esperadas = [
      { subject_id: 'mat', docente_id: 'd1' },
      { subject_id: 'len', docente_id: 'd2' },
      { subject_id: 'art', docente_id: null },
    ];
    const c = completitudDeAjustes(esperadas, [
      { subject_id: 'mat', ...ajuste() },
      { subject_id: 'len', ...ajuste({ ajuste_metodologico: '' }) },
      { subject_id: 'fuera-del-plan', ...ajuste() },
    ]);
    expect(c).toEqual({ total: 3, completas: 1, porcentaje: 33, sin_docente: ['art'], pendientes: ['len', 'art'] });
  });

  it('sin asignaturas en el plan no hay nada que completar (0%, no 100%)', () => {
    expect(completitudDeAjustes([], [])).toMatchObject({ total: 0, porcentaje: 0 });
  });
});

describe('pendientes para aprobar', () => {
  const completa = completitudDeAjustes([{ subject_id: 'mat', docente_id: 'd1' }], [{ subject_id: 'mat', ...ajuste() }]);
  const base = { tipo: 'PIAR' as const, consentimiento_otorgado: true, caracteristicas_completas: true, plan_apoyo_completo: false, completitud: completa };

  it('un PIAR completo se puede aprobar', () => {
    expect(pendientesParaAprobar(base)).toEqual([]);
  });

  it('sin autorización del responsable legal no se aprueba nada', () => {
    expect(pendientesParaAprobar({ ...base, consentimiento_otorgado: false })[0]).toMatch(/autorización/);
  });

  it('avisa las asignaturas que faltan y el plan sin asignaturas', () => {
    const parcial = completitudDeAjustes([{ subject_id: 'mat', docente_id: 'd1' }, { subject_id: 'len', docente_id: 'd2' }], [{ subject_id: 'mat', ...ajuste() }]);
    expect(pendientesParaAprobar({ ...base, completitud: parcial }).join(' ')).toMatch(/1 de 2/);
    expect(pendientesParaAprobar({ ...base, completitud: completitudDeAjustes([], []) }).join(' ')).toMatch(/plan de estudios/);
  });

  it('el plan de apoyo no exige ajustes por asignatura, solo su propio contenido', () => {
    const sinAjustes = completitudDeAjustes([], []);
    expect(pendientesParaAprobar({ ...base, tipo: 'PLAN_APOYO', plan_apoyo_completo: true, completitud: sinAjustes, caracteristicas_completas: false })).toEqual([]);
    expect(pendientesParaAprobar({ ...base, tipo: 'PLAN_APOYO', plan_apoyo_completo: false, completitud: sinAjustes })[0]).toMatch(/pauta/);
  });
});

describe('seguimiento y códigos', () => {
  it('cuenta los seguimientos que faltan sin bajar de cero', () => {
    expect(seguimientosFaltantes(1, 3)).toBe(2);
    expect(seguimientosFaltantes(5, 3)).toBe(0);
  });

  it('el código del documento lleva su prefijo, el año y un consecutivo de 4 dígitos', () => {
    expect(codigoDeDocumento('ACTA_ACUERDO_FAMILIA', 2026, 7)).toBe('AAF-2026-0007');
    expect(codigoDeDocumento('PIAR_AJUSTES', 2026, 123)).toBe('PIAR-2026-0123');
  });
});

describe('registro de documentos', () => {
  it('cada clave tiene exactamente una definición, con prefijo único', () => {
    expect(DOCUMENTOS_PIAR.map((d) => d.clave).sort()).toEqual([...CLAVES_DOCUMENTO_PIAR].sort());
    const prefijos = DOCUMENTOS_PIAR.map((d) => d.prefijo);
    expect(new Set(prefijos).size).toBe(prefijos.length);
  });

  it('lo clínico es confidencial y el paquete oficial nunca lo es (no lleva datos clínicos)', () => {
    const por = (clave: string) => DOCUMENTOS_PIAR.find((d) => d.clave === clave)!;
    expect(por('ANEXO_INFO_GENERAL').confidencial).toBe(true);
    expect(por('PLAN_APOYO').confidencial).toBe(true);
    expect(por('ACTA_OFICIAL_PIAR').confidencial).toBe(false);
  });

  it('las actas las firma el rector; el número de anexo es un texto, no un identificador', () => {
    const por = (clave: string) => DOCUMENTOS_PIAR.find((d) => d.clave === clave)!;
    expect(por('ACTA_ACUERDO_FAMILIA').firma_admin).toBe(true);
    expect(por('ACTA_OFICIAL_PIAR').firma_admin).toBe(true);
    expect(por('PIAR_AJUSTES').firma_admin).toBe(false);
    expect(typeof por('PIAR_AJUSTES').numero_anexo).toBe('string');
  });
});

describe('fusión de secciones parciales', () => {
  const actual = { salud: { diagnostico_medico: 'Baja visión', terapias: [{ nombre: 'TO' }], tratamiento_medico: 'Gotas' }, hogar: { vive_con: 'Madre' } };

  it('guardar un campo anidado no borra los demás de su grupo', () => {
    expect(fusionarSeccion(actual, { salud: { tratamiento_medico: 'Ninguno' } })).toEqual({
      salud: { diagnostico_medico: 'Baja visión', terapias: [{ nombre: 'TO' }], tratamiento_medico: 'Ninguno' },
      hogar: { vive_con: 'Madre' },
    });
  });

  it('las listas se reemplazan completas (quitar una terapia la quita) y lo no enviado se conserva', () => {
    const r = fusionarSeccion(actual, { salud: { terapias: [] } });
    expect(r.salud.terapias).toEqual([]);
    expect(r.salud.diagnostico_medico).toBe('Baja visión');
    expect(r.hogar.vive_con).toBe('Madre');
  });

  it('un valor vacío enviado a propósito sí reemplaza, y undefined no toca nada; el original no se muta', () => {
    expect(fusionarSeccion(actual, { hogar: { vive_con: '' } }).hogar.vive_con).toBe('');
    expect(fusionarSeccion(actual, { hogar: undefined }).hogar.vive_con).toBe('Madre');
    expect(actual.salud.tratamiento_medico).toBe('Gotas');
  });
});
