import { describe, expect, it } from 'vitest';
import {
  AsignacionMotor,
  EntradaMotor,
  EstructuraSemana,
  VariableMotor,
  construirEstructura,
  diagnosticarCapacidad,
  evaluarHorario,
  expandirSesiones,
  generarHorario,
  resolverVariables,
} from '../src/utils/motorHorarios';

// Jornada típica: 6 clases con descanso después de la 3.ª, lunes a viernes.
const franjas = [
  { nombre: '1', tipo: 'CLASE' as const, hora_inicio: '06:30', hora_fin: '07:25' },
  { nombre: '2', tipo: 'CLASE' as const, hora_inicio: '07:25', hora_fin: '08:20' },
  { nombre: '3', tipo: 'CLASE' as const, hora_inicio: '08:20', hora_fin: '09:15' },
  { nombre: 'Descanso', tipo: 'DESCANSO' as const, hora_inicio: '09:15', hora_fin: '09:45' },
  { nombre: '4', tipo: 'CLASE' as const, hora_inicio: '09:45', hora_fin: '10:40' },
  { nombre: '5', tipo: 'CLASE' as const, hora_inicio: '10:40', hora_fin: '11:35' },
  { nombre: '6', tipo: 'CLASE' as const, hora_inicio: '11:35', hora_fin: '12:30' },
];
const estructura: EstructuraSemana = construirEstructura([1, 2, 3, 4, 5], franjas);

let secuencia = 0;
function variable<T extends VariableMotor['tipo']>(
  tipo: T,
  parametros: Extract<VariableMotor, { tipo: T }>['parametros'],
  extra: Partial<Omit<VariableMotor, 'tipo' | 'parametros'>> = {}
): VariableMotor {
  secuencia += 1;
  return {
    id: `v${secuencia}`,
    severidad: 'DURA',
    peso: 5,
    alcance: { tipo: 'GLOBAL', grade_ids: [] },
    asignatura_ids: [],
    docente_ids: [],
    es_excepcion: false,
    ...extra,
    tipo,
    parametros,
  } as VariableMotor;
}

const asignacion = (id: string, group: string, grade: string, subject: string, docente: string, horas: number): AsignacionMotor => ({
  id,
  group_id: group,
  grade_id: grade,
  subject_id: subject,
  docente_id: docente,
  horas_semanales: horas,
});

describe('construirEstructura', () => {
  it('solo las franjas de clase son periodos y el descanso queda marcado en el siguiente', () => {
    expect(estructura.periodos).toHaveLength(6);
    expect(estructura.periodos.map((p) => p.descanso_antes)).toEqual([false, false, false, true, false, false]);
  });
});

describe('resolverVariables (alcance global, por un grado o por varios grados)', () => {
  const sesion6A = { group_id: '6A', grade_id: 'g6', subject_id: 'MAT', docente_ids: ['d1'] };
  const sesion11A = { group_id: '11A', grade_id: 'g11', subject_id: 'MAT', docente_ids: ['d1'] };

  it('una variable de valor único: la más específica gana', () => {
    const global = variable('DISTRIBUCION_BLOQUES', { bloques: [2, 2] }, { asignatura_ids: ['MAT'] });
    const media = variable('DISTRIBUCION_BLOQUES', { bloques: [2, 1, 1] }, { alcance: { tipo: 'GRADOS', grade_ids: ['g10', 'g11'] } });
    expect(resolverVariables([global, media], sesion6A).map((v) => v.id)).toEqual([global.id]);
    // GRADOS (sin asignatura) pesa más que GLOBAL con asignatura: el alcance manda.
    expect(resolverVariables([global, media], sesion11A).map((v) => v.id)).toEqual([media.id]);
  });

  it('las relaciones se acumulan y una excepción las anula donde la pidan', () => {
    const regla = variable('NO_MISMO_DIA', {}, { asignatura_ids: ['MAT'] });
    const otra = variable('NO_CONSECUTIVAS', { descanso_separa: true });
    const excepto11 = variable('NO_MISMO_DIA', {}, { es_excepcion: true, alcance: { tipo: 'GRADOS', grade_ids: ['g11'] } });
    expect(resolverVariables([regla, otra, excepto11], sesion6A).map((v) => v.id).sort()).toEqual([regla.id, otra.id].sort());
    expect(resolverVariables([regla, otra, excepto11], sesion11A).map((v) => v.id)).toEqual([otra.id]);
  });

  it('por grados aplica solo a los grupos de esos grados', () => {
    const v = variable('NO_MISMO_DIA', {}, { alcance: { tipo: 'GRADOS', grade_ids: ['g6', 'g7'] } });
    expect(resolverVariables([v], sesion6A)).toHaveLength(1);
    expect(resolverVariables([v], sesion11A)).toHaveLength(0);
  });

  it('entre dos reglas por grados gana la de menos grados', () => {
    const media = variable('DISTRIBUCION_BLOQUES', { bloques: [2, 2] }, { alcance: { tipo: 'GRADOS', grade_ids: ['g10', 'g11'] } });
    const once = variable('DISTRIBUCION_BLOQUES', { bloques: [2, 1, 1] }, { alcance: { tipo: 'GRADOS', grade_ids: ['g11'] } });
    expect(resolverVariables([once, media], sesion11A).map((v) => v.id)).toEqual([once.id]);
  });
});

describe('expandirSesiones', () => {
  it('parte las horas según el patrón y avisa si no cuadra', () => {
    const bloques = variable('DISTRIBUCION_BLOQUES', { bloques: [2, 1] }, { asignatura_ids: ['FIS'] });
    const { sesiones, avisos } = expandirSesiones(
      [asignacion('a1', '10A', 'g10', 'FIS', 'd1', 3), asignacion('a2', '10A', 'g10', 'FIS', 'd1', 4)],
      [bloques],
      estructura
    );
    expect(sesiones.filter((s) => s.asignacion_id === 'a1').map((s) => s.duracion)).toEqual([2, 1]);
    expect(sesiones.filter((s) => s.asignacion_id === 'a2').map((s) => s.duracion)).toEqual([2, 2]);
    expect(avisos.map((a) => a.codigo)).toEqual(['BLOQUES_NO_CUADRAN']);
  });

  it('una reunión colectiva crea una sesión sin grupo con todos sus docentes', () => {
    const reunion = variable('REUNION_COLECTIVA', { nombre: 'Reunión de Matemáticas', duracion: 2, sesiones: 1 }, { docente_ids: ['d1', 'd2', 'd3'] });
    const { sesiones } = expandirSesiones([], [reunion], estructura);
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({ group_id: null, duracion: 2, docente_ids: ['d1', 'd2', 'd3'] });
  });
});

describe('diagnosticarCapacidad', () => {
  it('avisa cuando un docente necesita más bloques dobles de los que caben en la semana', () => {
    const variables = [variable('DISTRIBUCION_BLOQUES', { bloques: [2, 2] }), variable('RECREO_NO_INTERRUMPE', {})];
    const grupos = ['6A', '6B', '6C', '6D', '7A', '7B'];
    const { sesiones } = expandirSesiones(grupos.map((g) => asignacion(g, g, 'g6', 'CAS', 'd1', 4)), variables, estructura);
    // 6 grupos × 2 bloques = 12; cada día caben 2 (uno antes y otro después del descanso) → 10.
    expect(diagnosticarCapacidad(sesiones, variables, estructura).map((a) => a.codigo)).toEqual(['BLOQUES_NO_CABEN']);
  });
});

describe('evaluarHorario', () => {
  const entradaDe = (asignaciones: AsignacionMotor[], variables: VariableMotor[]): EntradaMotor => ({
    estructura,
    variables,
    espacios: [{ id: 'LAB', admite_grupos_simultaneos: false }],
    sesiones: expandirSesiones(asignaciones, variables, estructura).sesiones,
  });

  it('detecta el choque de un docente en dos grupos a la vez', () => {
    const entrada = entradaDe([asignacion('a1', '6A', 'g6', 'MAT', 'd1', 1), asignacion('a2', '6B', 'g6', 'MAT', 'd1', 1)], []);
    const r = evaluarHorario(entrada, [
      { sesion_id: 'a1#0', dia: 1, periodo: 0 },
      { sesion_id: 'a2#0', dia: 1, periodo: 0 },
    ]);
    expect(r.conflictos_duros).toBe(1);
    expect(r.incidencias[0]?.codigo).toBe('CHOQUE_DOCENTE');
  });

  it('un bloque partido por el descanso incumple RECREO_NO_INTERRUMPE', () => {
    const entrada = entradaDe([asignacion('a1', '6A', 'g6', 'MAT', 'd1', 2)], [
      variable('DISTRIBUCION_BLOQUES', { bloques: [2] }),
      variable('RECREO_NO_INTERRUMPE', {}),
    ]);
    expect(evaluarHorario(entrada, [{ sesion_id: 'a1#0', dia: 1, periodo: 2 }]).conflictos_duros).toBe(1);
    expect(evaluarHorario(entrada, [{ sesion_id: 'a1#0', dia: 1, periodo: 3 }]).conflictos_duros).toBe(0);
  });

  it('la disponibilidad condicional penaliza como preferencia, la no disponible bloquea', () => {
    const entrada = entradaDe([asignacion('a1', '6A', 'g6', 'MAT', 'd1', 1)], [
      variable('DISPONIBILIDAD', {
        celdas: [
          { dia: 1, periodo: 5, valor: 'NO_DISPONIBLE' },
          { dia: 2, periodo: 5, valor: 'CONDICIONAL' },
        ],
      }, { docente_ids: ['d1'], peso: 3 }),
    ]);
    expect(evaluarHorario(entrada, [{ sesion_id: 'a1#0', dia: 1, periodo: 5 }]).conflictos_duros).toBe(1);
    const condicional = evaluarHorario(entrada, [{ sesion_id: 'a1#0', dia: 2, periodo: 5 }]);
    expect(condicional).toMatchObject({ conflictos_duros: 0, penalizacion_blanda: 3 });
  });

  it('dos sesiones que piden laboratorio a la misma hora chocan por espacio', () => {
    const lab = variable('ESPACIO_REQUERIDO', { espacio_ids: ['LAB'] }, { asignatura_ids: ['QUI'] });
    const entrada = entradaDe([asignacion('a1', '10A', 'g10', 'QUI', 'd1', 1), asignacion('a2', '11A', 'g11', 'QUI', 'd2', 1)], [lab]);
    const r = evaluarHorario(entrada, [
      { sesion_id: 'a1#0', dia: 3, periodo: 1 },
      { sesion_id: 'a2#0', dia: 3, periodo: 1 },
    ]);
    expect(r.incidencias.map((x) => x.codigo)).toEqual(['CHOQUE_ESPACIO']);
  });

  it('una sesión sin ubicar cuenta como conflicto (horas del plan que no se dictan)', () => {
    const entrada = entradaDe([asignacion('a1', '6A', 'g6', 'MAT', 'd1', 2)], []);
    const r = evaluarHorario(entrada, [{ sesion_id: 'a1#0', dia: 1, periodo: 0 }]);
    expect(r).toMatchObject({ conflictos_duros: 1, sin_ubicar: ['a1#1'] });
  });
});

describe('generarHorario', () => {
  it('respeta simultáneas entre grupos, sesiones fijas y "no el mismo día"', () => {
    const variables = [
      // Todos los grupos de 6° (aquí 6A y 6B) ven Educación Física a la misma hora.
      variable('SIMULTANEAS', {}, { asignatura_ids: ['EDF'], alcance: { tipo: 'GRADOS', grade_ids: ['g6'] } }),
      variable('NO_MISMO_DIA', {}, { asignatura_ids: ['MAT'] }),
    ];
    const asignaciones = [
      asignacion('ef1', '6A', 'g6', 'EDF', 'd1', 2),
      asignacion('ef2', '6B', 'g6', 'EDF', 'd2', 2),
      asignacion('m1', '6A', 'g6', 'MAT', 'd3', 4),
      asignacion('m2', '6B', 'g6', 'MAT', 'd3', 4),
    ];
    const { sesiones } = expandirSesiones(asignaciones, variables, estructura);
    sesiones.find((s) => s.id === 'm1#0')!.fija = { dia: 5, periodo: 5 };
    const r = generarHorario({ estructura, sesiones, variables, espacios: [] }, { semilla: 7, tiempo_max_ms: 3000 });

    expect(r.conflictos_duros).toBe(0);
    const pos = new Map(r.ubicaciones.map((u) => [u.sesion_id, u]));
    expect(pos.get('ef1#0')).toMatchObject({ dia: pos.get('ef2#0')!.dia, periodo: pos.get('ef2#0')!.periodo });
    expect(pos.get('m1#0')).toMatchObject({ dia: 5, periodo: 5 });
    const diasMat6A = sesiones.filter((s) => s.asignacion_id === 'm1').map((s) => pos.get(s.id)!.dia);
    expect(new Set(diasMat6A).size).toBe(4);
  });

  it('es reproducible con la misma semilla', () => {
    const asignaciones = [asignacion('a1', '6A', 'g6', 'MAT', 'd1', 5), asignacion('a2', '6A', 'g6', 'CAS', 'd2', 5)];
    const entrada: EntradaMotor = { estructura, variables: [], espacios: [], sesiones: expandirSesiones(asignaciones, [], estructura).sesiones };
    const a = generarHorario(entrada, { semilla: 42, iteraciones_max: 500 });
    const b = generarHorario(entrada, { semilla: 42, iteraciones_max: 500 });
    expect(a.ubicaciones).toEqual(b.ubicaciones);
  });

  it(
    'resuelve un colegio del tamaño real sin conflictos duros (17 grupos llenos, 30 periodos)',
    () => {
      const grupos = ['6A', '6B', '6C', '6D', '7A', '7B', '7C', '8A', '8B', '8C', '9A', '9B', '10A', '10C', '11A', '11C', '11D'];
      // Intensidad semanal por asignatura (suma 30 = semana completa del grupo, el caso más apretado).
      const plan: Array<[string, number]> = [
        ['MAT', 5], ['CAS', 4], ['CNAT', 4], ['CSOC', 4], ['ING', 3], ['EDF', 2], ['ART', 2], ['TEC', 2], ['ETI', 1], ['REL', 1], ['LEC', 2],
      ];
      // Cada docente toma grupos de una asignatura hasta 24 horas y 10 bloques dobles (lo máximo que cabe en la semana
      // si el descanso no puede partir un bloque: ver el aviso BLOQUES_NO_CABEN).
      const bloquesDobles: Record<string, number> = { MAT: 2, CAS: 1, CNAT: 2, CSOC: 1, EDF: 1 };
      const asignaciones: AsignacionMotor[] = [];
      const cargaPorDocente = new Map<string, { horas: number; bloques: number }>();
      for (const [asig, horas] of plan) {
        let n = 1;
        for (const g of grupos) {
          let docente = `${asig}-${n}`;
          const carga = cargaPorDocente.get(docente) ?? { horas: 0, bloques: 0 };
          if (carga.horas + horas > 24 || carga.bloques + (bloquesDobles[asig] ?? 0) > 10) {
            n += 1;
            docente = `${asig}-${n}`;
          }
          const actual = cargaPorDocente.get(docente) ?? { horas: 0, bloques: 0 };
          cargaPorDocente.set(docente, { horas: actual.horas + horas, bloques: actual.bloques + (bloquesDobles[asig] ?? 0) });
          asignaciones.push(asignacion(`${g}-${asig}`, g, `g${g.slice(0, -1)}`, asig, docente, horas));
        }
      }
      const docentesDe = (prefijo: string) => [...cargaPorDocente.keys()].filter((d) => d.startsWith(prefijo));

      const variables: VariableMotor[] = [
        variable('DISTRIBUCION_BLOQUES', { bloques: [2, 2, 1] }, { asignatura_ids: ['MAT'] }),
        variable('DISTRIBUCION_BLOQUES', { bloques: [2, 1, 1] }, { asignatura_ids: ['CAS', 'CSOC'] }),
        variable('DISTRIBUCION_BLOQUES', { bloques: [2, 2] }, { asignatura_ids: ['CNAT'] }),
        variable('DISTRIBUCION_BLOQUES', { bloques: [2] }, { asignatura_ids: ['EDF'] }),
        variable('RECREO_NO_INTERRUMPE', {}),
        variable('NO_MISMO_DIA', {}, { severidad: 'BLANDA', asignatura_ids: ['MAT'] }),
        variable('NO_CONSECUTIVAS', { descanso_separa: true }, { severidad: 'BLANDA', asignatura_ids: ['TEC', 'EDF'] }),
        variable('MAX_HUECOS_DOCENTE', { max_por_dia: 2 }, { severidad: 'BLANDA', peso: 2 }),
        // Ciencias de 10° y 11° en el único laboratorio (como Física/Biología de Alejandra Muñoz).
        variable('ESPACIO_REQUERIDO', { espacio_ids: ['LAB'] }, { asignatura_ids: ['CNAT'], alcance: { tipo: 'GRADOS', grade_ids: ['g10', 'g11'] } }),
        // Tiempo libre de una docente: no disponible lunes 5-6, martes 3 y 6, miércoles 6, jueves 2.
        variable('DISPONIBILIDAD', {
          celdas: [
            { dia: 1, periodo: 4, valor: 'NO_DISPONIBLE' }, { dia: 1, periodo: 5, valor: 'NO_DISPONIBLE' },
            { dia: 2, periodo: 2, valor: 'NO_DISPONIBLE' }, { dia: 2, periodo: 5, valor: 'NO_DISPONIBLE' },
            { dia: 3, periodo: 5, valor: 'NO_DISPONIBLE' }, { dia: 4, periodo: 1, valor: 'NO_DISPONIBLE' },
          ],
        }, { docente_ids: ['ING-1'] }),
        // Reunión de área: todos los de Matemáticas sin clase a la vez, 2 horas.
        variable('REUNION_COLECTIVA', { nombre: 'Reunión de Matemáticas', duracion: 2, sesiones: 1 }, { docente_ids: docentesDe('MAT') }),
      ];

      const { sesiones, avisos } = expandirSesiones(asignaciones, variables, estructura);
      expect(avisos).toEqual([]);
      expect(diagnosticarCapacidad(sesiones, variables, estructura)).toEqual([]);

      const espacios = [{ id: 'LAB', admite_grupos_simultaneos: false }];
      const r = generarHorario({ estructura, sesiones, variables, espacios }, { semilla: 1, tiempo_max_ms: 25_000 });
      expect(r.conflictos_duros).toBe(0);
      expect(evaluarHorario({ estructura, sesiones, variables, espacios }, r.ubicaciones).conflictos_duros).toBe(0);
      expect(r.ubicaciones.filter((u) => u.sesion_id.includes('-CNAT') && /^1[01]/.test(u.sesion_id)).every((u) => u.espacio_id === 'LAB')).toBe(true);
    },
    40_000
  );
});
