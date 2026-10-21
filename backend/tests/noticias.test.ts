import { describe, expect, it } from 'vitest';
import { renderizarNotificacion } from '../src/utils/notificaciones';
import { LectorDeNoticias, NoticiaParaLector, PublicadorDeNoticias, alcanceCabeEn, alcanceDe, cuandoEsTexto, estaVigente, motivoSinPermiso, noticiaAplica, ordenarNoticias, puedeModerar, vencimientoPorDefecto } from '../src/utils/noticias';

const ninguno = { sedes_ids: [], grados_ids: [], grupos_ids: [] };

describe('alcanceDe', () => {
  it('manda lo más específico', () => {
    expect(alcanceDe(ninguno)).toBe('INSTITUCION');
    expect(alcanceDe({ ...ninguno, sedes_ids: ['s'] })).toBe('SEDES');
    expect(alcanceDe({ ...ninguno, sedes_ids: ['s'], grados_ids: ['g'] })).toBe('GRADOS');
    expect(alcanceDe({ ...ninguno, grados_ids: ['g'], grupos_ids: ['x'] })).toBe('GRUPOS');
  });

  it('el máximo habilitado deja pasar lo igual o menor', () => {
    expect(alcanceCabeEn('GRUPOS', 'GRUPOS')).toBe(true);
    expect(alcanceCabeEn('GRUPOS', 'INSTITUCION')).toBe(true);
    expect(alcanceCabeEn('SEDES', 'GRADOS')).toBe(false);
    expect(alcanceCabeEn('INSTITUCION', 'SEDES')).toBe(false);
  });
});

describe('motivoSinPermiso', () => {
  const propuesta = { alcance: 'INSTITUCION' as const, categoria_id: 'pastoral', sedes: [] as string[], grupos_ajenos: 0 };
  const quien = (rol: PublicadorDeNoticias['rol'], extra: Partial<PublicadorDeNoticias> = {}): PublicadorDeNoticias => ({ rol, sedes_ids: ['s1'], habilitacion: null, ...extra });

  it('administración y coordinación publican para cualquier alcance', () => {
    expect(motivoSinPermiso(quien('ADMIN'), propuesta)).toBeNull();
    expect(motivoSinPermiso(quien('COORDINADOR'), propuesta)).toBeNull();
  });

  it('secretaría solo para sus sedes, nunca para toda la institución', () => {
    expect(motivoSinPermiso(quien('SECRETARIA'), propuesta)).toMatch(/al menos una sede/);
    expect(motivoSinPermiso(quien('SECRETARIA'), { ...propuesta, alcance: 'GRADOS', sedes: [] })).toMatch(/al menos una sede/);
    expect(motivoSinPermiso(quien('SECRETARIA'), { ...propuesta, alcance: 'SEDES', sedes: ['s1', 's2'] })).toMatch(/no es de las que tienes/);
    expect(motivoSinPermiso(quien('SECRETARIA'), { ...propuesta, alcance: 'SEDES', sedes: ['s1'] })).toBeNull();
  });

  it('un docente sin habilitación no publica', () => {
    expect(motivoSinPermiso(quien('DOCENTE'), { ...propuesta, alcance: 'GRUPOS', sedes: ['s1'] })).toMatch(/No tienes permiso/);
  });

  it('un docente habilitado respeta su alcance máximo', () => {
    const d = quien('DOCENTE', { habilitacion: { alcance_maximo: 'GRADOS', categorias_ids: [] } });
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'GRADOS', sedes: ['s1'] })).toBeNull();
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'SEDES', sedes: ['s1'] })).toMatch(/hasta un grado/);
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'INSTITUCION' })).toMatch(/hasta un grado/);
  });

  it('un docente habilitado para la institución publica para todos, de cualquier sede', () => {
    const d = quien('DOCENTE', { habilitacion: { alcance_maximo: 'INSTITUCION', categorias_ids: ['pastoral'] } });
    expect(motivoSinPermiso(d, propuesta)).toBeNull();
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'SEDES', sedes: ['otra'] })).toBeNull();
  });

  it('las categorías habilitadas limitan; vacías = todas', () => {
    const conLimite = quien('DOCENTE', { habilitacion: { alcance_maximo: 'INSTITUCION', categorias_ids: ['pastoral'] } });
    expect(motivoSinPermiso(conLimite, { ...propuesta, categoria_id: 'deporte' })).toMatch(/no cubre esa categoría/);
    const sinLimite = quien('DOCENTE', { habilitacion: { alcance_maximo: 'INSTITUCION', categorias_ids: [] } });
    expect(motivoSinPermiso(sinLimite, { ...propuesta, categoria_id: 'deporte' })).toBeNull();
  });

  it('por debajo de toda la institución solo para sus sedes, y en grupos solo los suyos', () => {
    const d = quien('DOCENTE', { habilitacion: { alcance_maximo: 'SEDES', categorias_ids: [] } });
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'SEDES', sedes: ['s1'] })).toBeNull();
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'SEDES', sedes: ['s9'] })).toMatch(/tus sedes/);
    expect(motivoSinPermiso(d, { ...propuesta, alcance: 'GRUPOS', sedes: ['s1'], grupos_ajenos: 1 })).toMatch(/dictas clase o diriges/);
  });

  it('el resto de perfiles no publica', () => {
    for (const rol of ['ESTUDIANTE', 'ACUDIENTE', 'ORIENTADOR', 'COORDINADOR_CONVIVENCIA'] as const) expect(motivoSinPermiso(quien(rol), propuesta)).toMatch(/no publica/);
  });

  it('administración y coordinación moderan todo; los demás, lo suyo', () => {
    expect(puedeModerar('ADMIN', false)).toBe(true);
    expect(puedeModerar('COORDINADOR', false)).toBe(true);
    expect(puedeModerar('SECRETARIA', false)).toBe(false);
    expect(puedeModerar('DOCENTE', true)).toBe(true);
  });
});

describe('noticiaAplica', () => {
  const noticia = (extra: Partial<NoticiaParaLector> = {}): NoticiaParaLector => ({ roles_destino: ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'], ...ninguno, alcance: 'INSTITUCION', ...extra });
  const lector = (rol: LectorDeNoticias['rol'], extra: Partial<LectorDeNoticias> = {}): LectorDeNoticias => ({ rol, sedes_ids: [], grados_ids: [], grupos_ids: [], ...extra });

  it('administración y coordinación ven todo', () => {
    expect(noticiaAplica(noticia({ alcance: 'GRUPOS', grupos_ids: ['x'], roles_destino: ['ESTUDIANTE'] }), lector('ADMIN'))).toBe(true);
    expect(noticiaAplica(noticia({ alcance: 'GRUPOS', grupos_ids: ['x'] }), lector('COORDINADOR'))).toBe(true);
  });

  it('el personal por sede ve lo de sus sedes aunque no se le nombre como destinatario', () => {
    const n = noticia({ roles_destino: ['ESTUDIANTE'], alcance: 'SEDES', sedes_ids: ['s1'] });
    expect(noticiaAplica(n, lector('SECRETARIA', { sedes_ids: ['s1'] }))).toBe(true);
    expect(noticiaAplica(n, lector('ORIENTADOR', { sedes_ids: ['s2'] }))).toBe(false);
    expect(noticiaAplica(noticia(), lector('COORDINADOR_CONVIVENCIA', { sedes_ids: ['s2'] }))).toBe(true);
  });

  it('docentes, estudiantes y acudientes ven lo dirigido a su perfil', () => {
    const n = noticia({ roles_destino: ['ESTUDIANTE', 'ACUDIENTE'] });
    expect(noticiaAplica(n, lector('ESTUDIANTE'))).toBe(true);
    expect(noticiaAplica(n, lector('ACUDIENTE'))).toBe(true);
    expect(noticiaAplica(n, lector('DOCENTE'))).toBe(false);
  });

  it('por grupos, grados y sedes llega solo a quien está en ellos', () => {
    const porGrupo = noticia({ alcance: 'GRUPOS', grupos_ids: ['g1'] });
    expect(noticiaAplica(porGrupo, lector('ESTUDIANTE', { grupos_ids: ['g1'] }))).toBe(true);
    expect(noticiaAplica(porGrupo, lector('ESTUDIANTE', { grupos_ids: ['g2'] }))).toBe(false);

    const porGrado = noticia({ alcance: 'GRADOS', grados_ids: ['6'] });
    expect(noticiaAplica(porGrado, lector('ACUDIENTE', { grados_ids: ['6'] }))).toBe(true);
    expect(noticiaAplica(porGrado, lector('ACUDIENTE', { grados_ids: ['7'] }))).toBe(false);

    const gradoEnSede = noticia({ alcance: 'GRADOS', grados_ids: ['6'], sedes_ids: ['s1'] });
    expect(noticiaAplica(gradoEnSede, lector('ESTUDIANTE', { grados_ids: ['6'], sedes_ids: ['s2'] }))).toBe(false);
    expect(noticiaAplica(gradoEnSede, lector('ESTUDIANTE', { grados_ids: ['6'], sedes_ids: ['s1'] }))).toBe(true);

    const porSede = noticia({ alcance: 'SEDES', sedes_ids: ['s1'] });
    expect(noticiaAplica(porSede, lector('DOCENTE', { sedes_ids: ['s1'] }))).toBe(true);
    expect(noticiaAplica(porSede, lector('DOCENTE', { sedes_ids: ['s2'] }))).toBe(false);
  });
});

describe('cuandoEsTexto y el aviso de una noticia nueva', () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('escribe el día, el rango y la hora; sin fecha no hay nada que decir', () => {
    expect(cuandoEsTexto({ fecha_inicio: null, fecha_fin: null, hora: '' })).toBeUndefined();
    expect(cuandoEsTexto({ fecha_inicio: d('2026-10-25'), fecha_fin: null, hora: '' })).toBe('25 de octubre');
    expect(cuandoEsTexto({ fecha_inicio: d('2026-10-25'), fecha_fin: null, hora: '09:30' })).toBe('25 de octubre, 09:30');
    expect(cuandoEsTexto({ fecha_inicio: d('2026-10-25'), fecha_fin: d('2026-10-27'), hora: '' })).toBe('25 de octubre al 27 de octubre');
    expect(cuandoEsTexto({ fecha_inicio: d('2026-10-25'), fecha_fin: d('2026-10-25'), hora: '' })).toBe('25 de octubre');
  });

  it('una sola noticia nueva dice cuál es; varias se acumulan en una alerta con la última', () => {
    const una = renderizarNotificacion('NOTICIA_NUEVA', 1, { titulo: 'Feria de ciencias', categoria: 'Académico', cuando: '12 de noviembre' });
    expect(una.titulo).toBe('Nuevo: Académico');
    expect(una.mensaje).toBe('«Feria de ciencias» · 12 de noviembre.');
    const varias = renderizarNotificacion('NOTICIA_NUEVA', 3, { titulo: 'Día de la Virgen' });
    expect(varias.titulo).toBe('Noticias y eventos nuevos');
    expect(varias.mensaje).toBe('Hay 3 noticias y eventos nuevos. El último: «Día de la Virgen».');
  });
});

describe('vigencia y orden', () => {
  const ahora = new Date('2026-10-20T15:00:00Z');
  const base = { estado: 'PUBLICADA', publicar_desde: new Date('2026-10-01T00:00:00Z'), vence_el: null as Date | null };

  it('vigente: publicada, ya empezó y no ha vencido', () => {
    expect(estaVigente(base, ahora)).toBe(true);
    expect(estaVigente({ ...base, estado: 'ARCHIVADA' }, ahora)).toBe(false);
    expect(estaVigente({ ...base, publicar_desde: new Date('2026-11-01T00:00:00Z') }, ahora)).toBe(false);
    expect(estaVigente({ ...base, vence_el: new Date('2026-10-19T00:00:00Z') }, ahora)).toBe(false);
  });

  it('si no se indica, vence al terminar el día del evento (hora de Colombia); sin evento, no vence', () => {
    expect(vencimientoPorDefecto(null, null)).toBeNull();
    expect(vencimientoPorDefecto(new Date('2026-10-25T00:00:00Z'), null)?.toISOString()).toBe('2026-10-26T04:59:59.999Z');
    expect(vencimientoPorDefecto(new Date('2026-10-25T00:00:00Z'), new Date('2026-10-27T00:00:00Z'))?.toISOString()).toBe('2026-10-28T04:59:59.999Z');
  });

  it('ordena: fijadas, luego eventos próximos (el más cercano primero) y al final lo demás, lo más reciente primero', () => {
    const n = (id: string, extra: object) => ({ id, fijada: false, fecha_inicio: null as Date | null, publicar_desde: new Date('2026-10-01T00:00:00Z'), ...extra });
    const lista = [
      n('sin-fecha-vieja', { publicar_desde: new Date('2026-09-01T00:00:00Z') }),
      n('evento-lejano', { fecha_inicio: new Date('2026-11-30T00:00:00Z') }),
      n('sin-fecha-nueva', { publicar_desde: new Date('2026-10-15T00:00:00Z') }),
      n('fijada', { fijada: true, publicar_desde: new Date('2026-09-15T00:00:00Z') }),
      n('evento-cercano', { fecha_inicio: new Date('2026-10-22T00:00:00Z') }),
      n('evento-hoy', { fecha_inicio: new Date('2026-10-20T00:00:00Z') }),
    ];
    expect(ordenarNoticias(lista, ahora).map((x) => x.id)).toEqual(['fijada', 'evento-hoy', 'evento-cercano', 'evento-lejano', 'sin-fecha-nueva', 'sin-fecha-vieja']);
  });
});
