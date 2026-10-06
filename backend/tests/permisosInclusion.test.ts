import { describe, expect, it } from 'vitest';
import { ContextoInclusion, UsuarioInclusion, permisoInclusion } from '../src/dominios/bienestar/inclusion/permisosInclusion';
import type { AccionInclusion } from '../src/dominios/bienestar/inclusion/permisosInclusion';

const usuario = (rol: UsuarioInclusion['rol'], sedes_ids: string[] = ['s1']): UsuarioInclusion => ({ id: 'u1', rol, sedes_ids });
const contexto = (extra: Partial<ContextoInclusion> = {}): ContextoInclusion => ({ sede_id: 's1', ...extra });

const TODAS: AccionInclusion[] = [
  'CREAR_SOLICITUD',
  'VER_BANDEJA',
  'GESTIONAR_EXPEDIENTE',
  'VER_CLINICO',
  'VER_FICHA_PEDAGOGICA',
  'EDITAR_AJUSTE',
  'VER_TODOS_LOS_AJUSTES',
  'EDITAR_TRANSVERSALES',
  'APROBAR',
  'EMITIR_DOCUMENTO',
  'DESCARGAR_DOCUMENTO',
  'DESCARGAR_CONFIDENCIAL',
  'FIRMAR_INSTITUCIONAL',
];
const permitidas = (u: UsuarioInclusion, c: ContextoInclusion) => TODAS.filter((a) => permisoInclusion(u, c, a));

describe('permisoInclusion (M16)', () => {
  it('ADMIN puede todo, en cualquier sede', () => {
    expect(permitidas(usuario('ADMIN', []), contexto({ sede_id: 'otra' }))).toEqual(TODAS);
  });

  it('el ORIENTADOR gestiona y ve lo clínico en su sede, pero no aprueba ni firma como rector', () => {
    const p = permitidas(usuario('ORIENTADOR'), contexto());
    expect(p).toContain('GESTIONAR_EXPEDIENTE');
    expect(p).toContain('VER_CLINICO');
    expect(p).toContain('EMITIR_DOCUMENTO');
    expect(p).not.toContain('APROBAR');
    expect(p).not.toContain('FIRMAR_INSTITUCIONAL');
  });

  it('el COORDINADOR supervisa y aprueba, pero no ve lo clínico ni redacta ni emite', () => {
    const p = permitidas(usuario('COORDINADOR'), contexto());
    expect(p).toContain('APROBAR');
    expect(p).toContain('VER_FICHA_PEDAGOGICA');
    expect(p).toContain('VER_TODOS_LOS_AJUSTES');
    for (const prohibida of ['VER_CLINICO', 'GESTIONAR_EXPEDIENTE', 'EMITIR_DOCUMENTO', 'DESCARGAR_CONFIDENCIAL', 'EDITAR_AJUSTE'] as const) {
      expect(p).not.toContain(prohibida);
    }
  });

  it('orientación y coordinación solo actúan en sus sedes; sin sedes no ven nada', () => {
    expect(permitidas(usuario('ORIENTADOR', ['s2']), contexto())).toEqual([]);
    expect(permitidas(usuario('COORDINADOR', []), contexto())).toEqual([]);
  });

  describe('docente', () => {
    it('sin vínculo con el estudiante no tiene ningún permiso', () => {
      expect(permitidas(usuario('DOCENTE'), contexto())).toEqual([]);
    });

    it('el docente de clase ve la ficha pedagógica y reporta, pero no ve lo clínico ni todos los ajustes', () => {
      const p = permitidas(usuario('DOCENTE'), contexto({ docenteDictaClase: true }));
      expect(p).toEqual(['CREAR_SOLICITUD', 'VER_FICHA_PEDAGOGICA']);
    });

    it('edita el ajuste solo de la asignatura que dicta (RN-16-05)', () => {
      const u = usuario('DOCENTE');
      expect(permisoInclusion(u, contexto({ docenteDictaClase: true, dictaLaAsignatura: false }), 'EDITAR_AJUSTE')).toBe(false);
      expect(permisoInclusion(u, contexto({ docenteDictaClase: true, dictaLaAsignatura: true }), 'EDITAR_AJUSTE')).toBe(true);
    });

    it('el director de grupo ve todos los ajustes de su grupo y las dimensiones transversales, sin lo clínico', () => {
      const p = permitidas(usuario('DOCENTE'), contexto({ esDirectorDeGrupo: true }));
      expect(p).toContain('VER_TODOS_LOS_AJUSTES');
      expect(p).toContain('EDITAR_TRANSVERSALES');
      expect(p).not.toContain('VER_CLINICO');
      expect(p).not.toContain('EDITAR_AJUSTE');
    });

    it('un docente de otra sede no tiene acceso aunque diga dictar clase', () => {
      expect(permitidas(usuario('DOCENTE', ['s2']), contexto({ docenteDictaClase: true }))).toEqual([]);
    });
  });

  it.each(['SECRETARIA', 'COORDINADOR_CONVIVENCIA', 'ACUDIENTE', 'ESTUDIANTE'] as const)('%s no tiene ningún permiso en M16', (rol) => {
    expect(permitidas(usuario(rol), contexto({ docenteDictaClase: true, esDirectorDeGrupo: true, dictaLaAsignatura: true }))).toEqual([]);
  });
});
