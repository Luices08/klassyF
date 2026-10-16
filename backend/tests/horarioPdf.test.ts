import { describe, expect, it } from 'vitest';
import { PALETA_ASIGNATURAS } from '../src/constants/horarios';
import { DetalleParaPdf, renderizarHorario, renderizarHorariosDeSede } from '../src/services/horarioPdf.service';
import { asignarColoresAsignaturas } from '../src/utils/coloresHorario';
import { AsignacionMotor, VariableMotor, construirEstructura, expandirSesiones, generarHorario } from '../src/utils/motorHorarios';

const franjas = [
  { nombre: '1', tipo: 'CLASE' as const, hora_inicio: '06:30', hora_fin: '07:25' },
  { nombre: '2', tipo: 'CLASE' as const, hora_inicio: '07:25', hora_fin: '08:20' },
  { nombre: '3', tipo: 'CLASE' as const, hora_inicio: '08:20', hora_fin: '09:15' },
  { nombre: 'Descanso', tipo: 'DESCANSO' as const, hora_inicio: '09:15', hora_fin: '09:45' },
  { nombre: '4', tipo: 'CLASE' as const, hora_inicio: '09:45', hora_fin: '10:40' },
  { nombre: '5', tipo: 'CLASE' as const, hora_inicio: '10:40', hora_fin: '11:35' },
  { nombre: '6', tipo: 'CLASE' as const, hora_inicio: '11:35', hora_fin: '12:30' },
];
const estructura = construirEstructura([1, 2, 3, 4, 5], franjas);

const ASIGNATURAS: Array<[string, string, string, number]> = [
  ['MAT', 'MAT', 'Matemáticas', 5], ['CAS', 'LEN', 'Lengua castellana', 4], ['CNAT', 'CNA', 'Ciencias naturales', 4], ['CSOC', 'SOC', 'Ciencias sociales', 4],
  ['ING', 'ING', 'Inglés', 3], ['EDF', 'EDF', 'Educación física', 2], ['ART', 'ART', 'Artística', 2], ['TEC', 'TEC', 'Tecnología', 2],
  ['ETI', 'ETI', 'Ética', 1], ['REL', 'REL', 'Religión', 1], ['LEC', 'LEC', 'Lectoescritura', 2],
];

/** Un colegio de verdad: grupos llenos, un docente por asignatura cada cuatro grupos y el motor decidiendo dónde va cada clase. */
function armarDetalle(grupos: string[], tiempo_max_ms: number): DetalleParaPdf {
  const asignaciones: AsignacionMotor[] = grupos.flatMap((g) =>
    ASIGNATURAS.map(([id, , , horas]) => ({
      id: `${g}-${id}`,
      group_id: g,
      grade_id: `g${g.slice(0, -1)}`,
      subject_id: id,
      docente_id: `${id}-${Math.floor(grupos.indexOf(g) / 4) + 1}`,
      horas_semanales: horas,
    }))
  );
  const bloque = (bloques: number[], asignatura_ids: string[]): VariableMotor =>
    ({ id: `b-${bloques.join('')}`, tipo: 'DISTRIBUCION_BLOQUES', severidad: 'DURA', peso: 5, alcance: { tipo: 'GLOBAL', grade_ids: [] }, asignatura_ids, docente_ids: [], es_excepcion: false, parametros: { bloques } }) as VariableMotor;
  const variables = [bloque([2, 2, 1], ['MAT']), bloque([2, 2], ['CAS', 'CNAT', 'CSOC']), bloque([2], ['EDF', 'ART', 'TEC'])];
  const { sesiones } = expandirSesiones(asignaciones, variables, estructura);
  const r = generarHorario({ estructura, sesiones, variables, espacios: [] }, { semilla: 5, tiempo_max_ms });
  const ubicacion = new Map(r.ubicaciones.map((u) => [u.sesion_id, u]));

  const colores = asignarColoresAsignaturas(ASIGNATURAS.map(([id]) => id));
  const docentes = [...new Set(asignaciones.map((a) => a.docente_id))].sort();
  const detalle = {
    horario: {
      estado: 'PUBLICADO',
      sesiones: sesiones.map((s) => ({
        _id: s.id,
        clave: s.id,
        asignacion_id: s.asignacion_id,
        reunion_variable_id: null,
        group_id: s.group_id,
        subject_id: s.subject_id,
        docente_ids: s.docente_ids,
        dia: ubicacion.get(s.id)!.dia,
        periodo: ubicacion.get(s.id)!.periodo,
        duracion: s.duracion,
        espacio_id: null,
        fija: false,
      })),
    },
    estructura,
    catalogo: {
      grupos: grupos.map((g) => ({ _id: g, etiqueta: `${g.slice(0, -1)}° ${g.slice(-1)}`, etiqueta_corta: g, grade_id: `g${g.slice(0, -1)}` })),
      docentes: docentes.map((d) => ({ _id: d, nombre: `Profe ${d}`, nombre_corto: `P. ${d}` })),
      asignaturas: ASIGNATURAS.map(([id, abreviatura, nombre]) => ({ _id: id, nombre, abreviatura, color: colores.get(id)! })),
      espacios: [],
      reuniones: [],
    },
  };
  return detalle as unknown as DetalleParaPdf;
}

const paginasDe = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
const contexto = { institucion: 'Institución Educativa Prueba', subtitulo: '2026 · Sede principal · Jornada Mañana · Versión 1 (Publicado)' };

describe('colores por asignatura', () => {
  it('cada asignatura toma un color distinto mientras haya en la paleta, y agregar una nueva no cambia los anteriores', () => {
    const antes = asignarColoresAsignaturas(['b', 'a', 'c']);
    expect(new Set([...antes.values()].map((c) => c.fondo)).size).toBe(3);
    const despues = asignarColoresAsignaturas(['a', 'b', 'c', 'd']);
    for (const id of ['a', 'b', 'c']) expect(despues.get(id)).toEqual(antes.get(id));
    expect(new Set(PALETA_ASIGNATURAS.map((c) => c.fondo)).size).toBe(PALETA_ASIGNATURAS.length);
  });

  it('con más asignaturas que colores la paleta se reutiliza en vez de fallar', () => {
    const muchas = asignarColoresAsignaturas(Array.from({ length: PALETA_ASIGNATURAS.length + 3 }, (_, i) => `s${String(i).padStart(2, '0')}`));
    expect(muchas.size).toBe(PALETA_ASIGNATURAS.length + 3);
  });
});

describe('PDF del horario', () => {
  const grupos = ['6A', '6B', '6C', '6D', '7A', '7B', '7C', '8A', '8B', '8C', '9A', '9B', '10A', '10C', '11A', '11C', '11D'];
  const detalle = armarDetalle(grupos, 6000);

  it('la hoja total de grupos cabe en una página; la de docentes (55 filas) se reparte en dos, pareja', async () => {
    const porGrupos = await renderizarHorario(detalle, contexto, 'TOTAL_GRUPOS');
    const porDocentes = await renderizarHorario(detalle, contexto, 'GENERAL');
    expect(porGrupos.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(paginasDe(porGrupos.buffer)).toBe(1);
    expect(detalle.catalogo.docentes).toHaveLength(55);
    expect(paginasDe(porDocentes.buffer)).toBe(2);
  }, 30_000);

  it('la versión completa trae las dos hojas totales, una página por docente y una por grupo', async () => {
    const { buffer, sufijo } = await renderizarHorario(detalle, contexto, 'COMPLETO');
    expect(sufijo).toBe('-completo');
    expect(paginasDe(buffer)).toBe(1 + 2 + detalle.catalogo.docentes.length + grupos.length);
  }, 30_000);

  it('el de toda la sede junta las jornadas en un solo documento', async () => {
    const tarde = armarDetalle(['6A', '6B'], 1500);
    const pdf = await renderizarHorariosDeSede([
      { detalle, contexto, titulo: 'Jornada Mañana' },
      { detalle: tarde, contexto: { ...contexto, subtitulo: '2026 · Sede principal · Jornada Tarde' }, titulo: 'Jornada Tarde' },
    ]);
    expect(paginasDe(pdf)).toBe(1 + 2 + detalle.catalogo.docentes.length + grupos.length + (1 + 1 + tarde.catalogo.docentes.length + 2));
  }, 40_000);

  it('un docente o un grupo que no está en la versión responde 404', async () => {
    await expect(renderizarHorario(detalle, contexto, 'DOCENTE', 'no-existe')).rejects.toMatchObject({ statusCode: 404 });
  });
});
