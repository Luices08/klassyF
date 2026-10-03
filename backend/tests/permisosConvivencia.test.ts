import { describe, expect, it } from 'vitest';
import { puedeGestionarRol, ROLES_CON_SEDE_OBLIGATORIA } from '../src/constants/roles';
import {
  AccionConvivencia,
  alcanceDeSedes,
  EstudianteConvivencia,
  permisoSobreEstudiante,
  UsuarioConvivencia,
} from '../src/utils/permisosConvivencia';

const usuario = (rol: UsuarioConvivencia['rol'], sedes_ids: string[] = ['s1'], id = 'u1'): UsuarioConvivencia => ({
  id,
  rol,
  sedes_ids,
});
const estudiante = (extra: Partial<EstudianteConvivencia> = {}): EstudianteConvivencia => ({
  user_id: 'est1',
  sede_id: 's1',
  ...extra,
});
const acciones: AccionConvivencia[] = [
  'REGISTRAR_OBSERVACION',
  'REGISTRAR_FALTA',
  'CONSULTAR_OBSERVACIONES_PROPIAS',
  'CONSULTAR_HISTORIAL',
  'VER_ESTADO_CASO',
  'CONSULTAR_CASO',
  'GESTIONAR_CASO',
  'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS',
];
const accionesDePersonal = acciones.filter((a) => a !== 'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS');
const permitidas = (u: UsuarioConvivencia, e: EstudianteConvivencia) =>
  acciones.filter((a) => permisoSobreEstudiante(u, e, a));

describe('roles de convivencia y orientación en la jerarquía', () => {
  it('solo el ADMIN gestiona al orientador, que también exige sede', () => {
    expect(puedeGestionarRol('ADMIN', 'ORIENTADOR')).toBe(true);
    for (const operador of ['COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'DOCENTE', 'SECRETARIA'] as const) {
      expect(puedeGestionarRol(operador, 'ORIENTADOR'), operador).toBe(false);
    }
    expect(puedeGestionarRol('ORIENTADOR', 'DOCENTE')).toBe(true);
    expect(ROLES_CON_SEDE_OBLIGATORIA).toContain('ORIENTADOR');
  });
});

describe('rol COORDINADOR_CONVIVENCIA en la jerarquía', () => {
  it('solo el ADMIN lo gestiona y no gestiona a su par', () => {
    expect(puedeGestionarRol('ADMIN', 'COORDINADOR_CONVIVENCIA')).toBe(true);
    expect(puedeGestionarRol('COORDINADOR', 'COORDINADOR_CONVIVENCIA')).toBe(false);
    expect(puedeGestionarRol('COORDINADOR_CONVIVENCIA', 'COORDINADOR')).toBe(false);
    expect(puedeGestionarRol('DOCENTE', 'COORDINADOR_CONVIVENCIA')).toBe(false);
  });

  it('exige sede', () => {
    expect(ROLES_CON_SEDE_OBLIGATORIA).toContain('COORDINADOR_CONVIVENCIA');
  });
});

describe('alcanceDeSedes', () => {
  it('ADMIN ve todas y el resto solo las suyas', () => {
    expect(alcanceDeSedes(usuario('ADMIN', []))).toBe('TODAS');
    expect(alcanceDeSedes(usuario('COORDINADOR_CONVIVENCIA', ['s1', 's2']))).toEqual(['s1', 's2']);
  });
});

describe('permisoSobreEstudiante', () => {
  it('ADMIN puede todo, en cualquier sede', () => {
    expect(permitidas(usuario('ADMIN', []), estudiante({ sede_id: 'otra' }))).toEqual(accionesDePersonal);
  });

  it('el coordinador de convivencia gestiona todo, pero solo en sus sedes', () => {
    const u = usuario('COORDINADOR_CONVIVENCIA');
    expect(permitidas(u, estudiante())).toEqual(accionesDePersonal);
    expect(permitidas(u, estudiante({ sede_id: 's2' }))).toEqual([]);
  });

  it('un coordinador de convivencia sin sede no ve nada', () => {
    expect(permitidas(usuario('COORDINADOR_CONVIVENCIA', []), estudiante())).toEqual([]);
  });

  it('el orientador registra su seguimiento y ve el historial de su sede, pero no registra faltas ni gestiona casos', () => {
    const u = usuario('ORIENTADOR');
    expect(permitidas(u, estudiante())).toEqual([
      'REGISTRAR_OBSERVACION',
      'CONSULTAR_OBSERVACIONES_PROPIAS',
      'CONSULTAR_HISTORIAL',
      'VER_ESTADO_CASO',
    ]);
    expect(permitidas(u, estudiante({ sede_id: 's2' }))).toEqual([]);
    expect(permitidas(usuario('ORIENTADOR', []), estudiante())).toEqual([]);
  });

  it('el coordinador académico registra observaciones y ve el historial, pero ni faltas ni casos', () => {
    expect(permitidas(usuario('COORDINADOR'), estudiante())).toEqual([
      'REGISTRAR_OBSERVACION',
      'CONSULTAR_OBSERVACIONES_PROPIAS',
      'CONSULTAR_HISTORIAL',
    ]);
  });

  it('el docente de clase registra y ve solo lo suyo, nunca el historial', () => {
    expect(permitidas(usuario('DOCENTE'), estudiante({ docenteDictaClase: true }))).toEqual([
      'REGISTRAR_OBSERVACION',
      'REGISTRAR_FALTA',
      'CONSULTAR_OBSERVACIONES_PROPIAS',
    ]);
  });

  it('un docente sin relación con el estudiante no registra', () => {
    expect(permisoSobreEstudiante(usuario('DOCENTE'), estudiante(), 'REGISTRAR_OBSERVACION')).toBe(false);
  });

  it('el director de grupo ve el historial y el estado del caso, pero no gestiona', () => {
    expect(permitidas(usuario('DOCENTE'), estudiante({ esDirectorDeGrupo: true }))).toEqual([
      'REGISTRAR_OBSERVACION',
      'REGISTRAR_FALTA',
      'CONSULTAR_OBSERVACIONES_PROPIAS',
      'CONSULTAR_HISTORIAL',
      'VER_ESTADO_CASO',
    ]);
  });

  it('el estudiante solo consulta lo visible de sí mismo', () => {
    expect(permitidas(usuario('ESTUDIANTE', [], 'est1'), estudiante())).toEqual([
      'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS',
    ]);
    expect(permitidas(usuario('ESTUDIANTE', [], 'otro'), estudiante())).toEqual([]);
    expect(permitidas(usuario('ESTUDIANTE', [], 'x'), estudiante({ user_id: null }))).toEqual([]);
  });

  it('secretaría y acudiente no tienen acceso', () => {
    expect(permitidas(usuario('SECRETARIA'), estudiante({ esDirectorDeGrupo: true }))).toEqual([]);
    expect(permitidas(usuario('ACUDIENTE', [], 'est1'), estudiante())).toEqual([]);
  });
});
