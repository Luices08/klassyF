import { describe, expect, it } from 'vitest';
import { ROLES_LIST } from '../src/constants/roles';
import { AccionPlaneacion, ContextoPlaneacion, permisoPlaneacion } from '../src/utils/permisosPlaneacion';

const TODAS: AccionPlaneacion[] = [
  'GESTIONAR_DOCUMENTOS_REFERENCIA',
  'VER_DOCUMENTOS_REFERENCIA',
  'ASIGNAR_LIDER',
  'CONFIGURAR_VENTANA',
  'VER_BANDEJA',
  'REVISAR_PLAN',
  'REABRIR_PLAN',
  'CARGAR_PLAN_AREA',
  'VER_PLAN_AREA',
  'CARGAR_PLAN_AULA',
  'VER_PLAN_AULA',
];

const permitidas = (rol: Parameters<typeof permisoPlaneacion>[0], contexto: ContextoPlaneacion = {}) => TODAS.filter((a) => permisoPlaneacion(rol, contexto, a));

describe('permisoPlaneacion (M07)', () => {
  it('el ADMIN hace todo lo de coordinación y además reabre; pero nunca carga un plan en nombre de nadie', () => {
    const admin = permitidas('ADMIN');
    for (const accion of permitidas('COORDINADOR')) expect(admin).toContain(accion);
    expect(admin).toContain('REABRIR_PLAN');
    expect(admin).not.toContain('CARGAR_PLAN_AREA');
    expect(admin).not.toContain('CARGAR_PLAN_AULA');
  });

  it('el COORDINADOR administra documentos, líderes y ventanas, y revisa, pero no reabre ni carga', () => {
    const p = permitidas('COORDINADOR');
    expect(p).toEqual(
      expect.arrayContaining(['GESTIONAR_DOCUMENTOS_REFERENCIA', 'ASIGNAR_LIDER', 'CONFIGURAR_VENTANA', 'VER_BANDEJA', 'REVISAR_PLAN', 'VER_PLAN_AREA', 'VER_PLAN_AULA'])
    );
    expect(p).not.toContain('REABRIR_PLAN');
    expect(p).not.toContain('CARGAR_PLAN_AREA');
    expect(p).not.toContain('CARGAR_PLAN_AULA');
  });

  it('un docente sin vínculo solo consulta los documentos de apoyo', () => {
    expect(permitidas('DOCENTE')).toEqual(['VER_DOCUMENTOS_REFERENCIA']);
  });

  it('solo el líder del área carga el plan de área; no basta con dictar clase en ella', () => {
    expect(permisoPlaneacion('DOCENTE', { esLiderDelArea: true }, 'CARGAR_PLAN_AREA')).toBe(true);
    expect(permisoPlaneacion('DOCENTE', { imparteEnElArea: true }, 'CARGAR_PLAN_AREA')).toBe(false);
    expect(permisoPlaneacion('DOCENTE', {}, 'CARGAR_PLAN_AREA')).toBe(false);
  });

  it('los demás docentes del área ven el plan de área solo cuando ya está aprobado; el líder lo ve siempre', () => {
    expect(permisoPlaneacion('DOCENTE', { imparteEnElArea: true, estadoPlan: 'APROBADO' }, 'VER_PLAN_AREA')).toBe(true);
    for (const estadoPlan of ['EN_REVISION', 'DEVUELTO'] as const) {
      expect(permisoPlaneacion('DOCENTE', { imparteEnElArea: true, estadoPlan }, 'VER_PLAN_AREA')).toBe(false);
      expect(permisoPlaneacion('DOCENTE', { esLiderDelArea: true, estadoPlan }, 'VER_PLAN_AREA')).toBe(true);
    }
    expect(permisoPlaneacion('DOCENTE', { estadoPlan: 'APROBADO' }, 'VER_PLAN_AREA')).toBe(false);
  });

  it('solo quien dicta la asignatura en ese grado carga su plan de aula', () => {
    expect(permisoPlaneacion('DOCENTE', { imparteLaAsignaturaYGrado: true }, 'CARGAR_PLAN_AULA')).toBe(true);
    expect(permisoPlaneacion('DOCENTE', { imparteEnElArea: true, esLiderDelArea: true }, 'CARGAR_PLAN_AULA')).toBe(false);
  });

  it('un plan de aula lo ve su dueño; un plan archivado y aprobado, además, quien hoy dicta esa asignatura (para decidir si lo adopta)', () => {
    expect(permisoPlaneacion('DOCENTE', { esDuenioDelPlan: true }, 'VER_PLAN_AULA')).toBe(true);
    expect(permisoPlaneacion('DOCENTE', { imparteLaAsignaturaYGrado: true, planArchivado: true, estadoPlan: 'APROBADO' }, 'VER_PLAN_AULA')).toBe(true);
    // El de un colega que sigue activo no se ve, ni uno archivado sin aprobar.
    expect(permisoPlaneacion('DOCENTE', { imparteLaAsignaturaYGrado: true, planArchivado: false, estadoPlan: 'APROBADO' }, 'VER_PLAN_AULA')).toBe(false);
    expect(permisoPlaneacion('DOCENTE', { imparteLaAsignaturaYGrado: true, planArchivado: true, estadoPlan: 'DEVUELTO' }, 'VER_PLAN_AULA')).toBe(false);
    expect(permisoPlaneacion('DOCENTE', { planArchivado: true, estadoPlan: 'APROBADO' }, 'VER_PLAN_AULA')).toBe(false);
  });

  it('ningún otro rol tiene acceso, ni siquiera con un contexto favorable (lista de permitidos, sin herencia)', () => {
    const favorable: ContextoPlaneacion = { esLiderDelArea: true, imparteEnElArea: true, esDuenioDelPlan: true, imparteLaAsignaturaYGrado: true, planArchivado: true, estadoPlan: 'APROBADO' };
    for (const rol of ROLES_LIST.filter((r) => !['ADMIN', 'COORDINADOR', 'DOCENTE'].includes(r))) {
      expect(permitidas(rol, favorable)).toEqual([]);
    }
  });
});
