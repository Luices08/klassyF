import { describe, expect, it } from 'vitest';
import { TRANSICIONES_PLAN } from '../src/constants/planeacion';
import {
  PeriodoVentana,
  asignaturasPorGrado,
  bloqueoDeCargaPlanAula,
  estadoDeVentana,
  evaluarRadicacion,
  motivoAreaPendiente,
  planesAdoptables,
  siguienteEstado,
  validarVentana,
  ventanaDeEntrega,
} from '../src/utils/planeacion';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

const periodos = (extra: Record<number, Partial<PeriodoVentana>> = {}): PeriodoVentana[] =>
  [
    { numero: 1, fecha_inicio: dia('2026-02-02'), fecha_fin: dia('2026-04-10') },
    { numero: 2, fecha_inicio: dia('2026-04-13'), fecha_fin: dia('2026-06-19') },
    { numero: 3, fecha_inicio: dia('2026-07-13'), fecha_fin: dia('2026-09-18') },
    { numero: 4, fecha_inicio: dia('2026-09-21'), fecha_fin: dia('2026-11-27') },
  ].map((p) => ({ ...p, ...extra[p.numero] }));

describe('ventanaDeEntrega: lo sugerido y lo configurado', () => {
  it('sugiere abrir 2 semanas antes de que termine el periodo previo y cerrar el día anterior al inicio del periodo', () => {
    const v = ventanaDeEntrega(periodos(), 2)!;
    expect(iso(v.apertura)).toBe('2026-03-27'); // 2026-04-10 menos 14 días
    expect(iso(v.limite)).toBe('2026-04-12'); // el día antes de que empiece el periodo 2
    expect(v.apertura_personalizada).toBe(false);
    expect(v.limite_personalizado).toBe(false);

    const v3 = ventanaDeEntrega(periodos(), 3)!;
    expect(iso(v3.apertura)).toBe('2026-06-05');
    expect(iso(v3.limite)).toBe('2026-07-12');
  });

  it('el Periodo 1 no tiene periodo previo en el año: cierra antes de empezar las clases y abre 2 semanas antes de ese cierre', () => {
    const v = ventanaDeEntrega(periodos(), 1)!;
    expect(iso(v.limite)).toBe('2026-02-01');
    expect(iso(v.apertura)).toBe('2026-01-18');
  });

  it('lo que fijó coordinación gana sobre lo sugerido, campo por campo', () => {
    const v = ventanaDeEntrega(periodos({ 2: { fecha_apertura_planes_aula: dia('2026-04-01') } }), 2)!;
    expect(iso(v.apertura)).toBe('2026-04-01');
    expect(v.apertura_personalizada).toBe(true);
    expect(iso(v.limite)).toBe('2026-04-12');
    expect(v.limite_personalizado).toBe(false);

    const w = ventanaDeEntrega(periodos({ 2: { fecha_limite_planes_aula: dia('2026-04-20') } }), 2)!;
    expect(iso(w.limite)).toBe('2026-04-20');
    expect(w.limite_personalizado).toBe(true);
    expect(iso(w.apertura)).toBe('2026-03-27');
  });

  it('la apertura sugerida nunca queda después del cierre si coordinación adelantó el cierre', () => {
    const v = ventanaDeEntrega(periodos({ 2: { fecha_limite_planes_aula: dia('2026-03-01') } }), 2)!;
    expect(iso(v.limite)).toBe('2026-03-01');
    expect(iso(v.apertura)).toBe('2026-03-01');
  });

  it('un periodo que el año no tiene no tiene ventana', () => {
    expect(ventanaDeEntrega(periodos(), 5)).toBeNull();
    expect(ventanaDeEntrega([], 1)).toBeNull();
  });
});

describe('estadoDeVentana (hora de Colombia: el día de apertura y el de cierre cuentan completos)', () => {
  const v = { apertura: dia('2026-03-27'), limite: dia('2026-04-12') };

  it('no abre hasta que empieza el día de apertura en Colombia', () => {
    expect(estadoDeVentana(v, new Date('2026-03-27T04:59:59.999Z'))).toBe('NO_ABIERTA');
    expect(estadoDeVentana(v, new Date('2026-03-27T05:00:00.000Z'))).toBe('ABIERTA');
  });

  it('el día límite cuenta hasta su último instante; después está vencida', () => {
    expect(estadoDeVentana(v, new Date('2026-04-13T04:59:59.999Z'))).toBe('ABIERTA');
    expect(estadoDeVentana(v, new Date('2026-04-13T05:00:00.000Z'))).toBe('VENCIDA');
  });
});

describe('validarVentana', () => {
  it('acepta la ventana sugerida y una que coordinación ajusta con sentido', () => {
    for (const n of [1, 2, 3, 4]) expect(validarVentana(periodos(), n)).toBeNull();
    expect(validarVentana(periodos({ 2: { fecha_apertura_planes_aula: dia('2026-04-01'), fecha_limite_planes_aula: dia('2026-04-20') } }), 2)).toBeNull();
  });

  it('el límite no puede ser anterior a la apertura', () => {
    expect(validarVentana(periodos({ 2: { fecha_apertura_planes_aula: dia('2026-04-10'), fecha_limite_planes_aula: dia('2026-04-05') } }), 2)).toMatch(/anterior a la apertura/);
  });

  it('el límite del Periodo 1 tiene que ser anterior al inicio de clases (los demás pueden extenderse)', () => {
    expect(validarVentana(periodos({ 1: { fecha_limite_planes_aula: dia('2026-02-02') } }), 1)).toMatch(/anterior al inicio de clases/);
    expect(validarVentana(periodos({ 1: { fecha_limite_planes_aula: dia('2026-02-10') } }), 1)).toMatch(/anterior al inicio de clases/);
    expect(validarVentana(periodos({ 1: { fecha_limite_planes_aula: dia('2026-02-01') } }), 1)).toBeNull();
    // Un periodo posterior sí admite una prórroga general pasada la fecha de inicio: la fecha solo decide la etiqueta de plazo.
    expect(validarVentana(periodos({ 2: { fecha_limite_planes_aula: dia('2026-04-30') } }), 2)).toBeNull();
  });

  it('un periodo inexistente se avisa', () => {
    expect(validarVentana(periodos(), 9)).toMatch(/no tiene el periodo 9/);
  });
});

describe('evaluarRadicacion: «entregado fuera de plazo»', () => {
  const ventana = { limite: dia('2026-04-12') };

  it('a tiempo hasta el último instante del día límite en Colombia', () => {
    expect(evaluarRadicacion(new Date('2026-04-10T15:00:00Z'), ventana, null)).toEqual({ fuera_de_plazo: false, fecha_limite: ventana.limite });
    expect(evaluarRadicacion(new Date('2026-04-13T04:59:59.999Z'), ventana, null).fuera_de_plazo).toBe(false);
  });

  it('un instante después ya es fuera de plazo, y el límite que regía queda registrado', () => {
    const r = evaluarRadicacion(new Date('2026-04-13T05:00:00.000Z'), ventana, null);
    expect(r.fuera_de_plazo).toBe(true);
    expect(r.fecha_limite).toEqual(ventana.limite);
  });

  it('no cuenta contra quien fue asignado después del cierre: no pudo cumplir un plazo que ya había pasado', () => {
    const asignadoDespues = new Date('2026-04-20T12:00:00Z');
    expect(evaluarRadicacion(new Date('2026-04-21T12:00:00Z'), ventana, asignadoDespues).fuera_de_plazo).toBe(false);
    // Asignado antes del cierre sí debía cumplirlo.
    expect(evaluarRadicacion(new Date('2026-04-21T12:00:00Z'), ventana, new Date('2026-03-01T12:00:00Z')).fuera_de_plazo).toBe(true);
  });

  it('un periodo sin ventana no tiene plazo que incumplir', () => {
    expect(evaluarRadicacion(new Date(), null, null)).toEqual({ fuera_de_plazo: false, fecha_limite: null });
  });
});

describe('bloqueoDeCargaPlanAula: el plazo vencido no cierra el formulario', () => {
  const base = { anioCerrado: false, planAreaEstado: 'APROBADO' as const, planAulaEstado: 'SIN_CARGAR' as const, ventana: 'ABIERTA' as const };

  it('con todo en orden se puede radicar', () => {
    expect(bloqueoDeCargaPlanAula(base)).toBeNull();
  });

  it('vencida la fecha límite sigue disponible (queda marcado fuera de plazo, no se bloquea)', () => {
    expect(bloqueoDeCargaPlanAula({ ...base, ventana: 'VENCIDA' })).toBeNull();
  });

  it('un plan devuelto se puede corregir siempre, haya vencido o no la ventana, hasta que se apruebe', () => {
    for (const ventana of ['NO_ABIERTA', 'ABIERTA', 'VENCIDA'] as const) {
      expect(bloqueoDeCargaPlanAula({ ...base, planAulaEstado: 'DEVUELTO', ventana })).toBeNull();
    }
  });

  it('antes de abrir la entrega no se radica por primera vez', () => {
    expect(bloqueoDeCargaPlanAula({ ...base, ventana: 'NO_ABIERTA' })).toBe('VENTANA_NO_ABIERTA');
  });

  it('sin el plan de área aprobado no se carga el plan de aula, en ningún estado del área', () => {
    for (const planAreaEstado of ['SIN_CARGAR', 'EN_REVISION', 'DEVUELTO'] as const) {
      expect(bloqueoDeCargaPlanAula({ ...base, planAreaEstado })).toBe('PLAN_AREA_PENDIENTE');
    }
  });

  it('en revisión o aprobado no se reemplaza, y un año cerrado solo admite consulta', () => {
    expect(bloqueoDeCargaPlanAula({ ...base, planAulaEstado: 'EN_REVISION' })).toBe('EN_REVISION');
    expect(bloqueoDeCargaPlanAula({ ...base, planAulaEstado: 'APROBADO' })).toBe('APROBADO');
    expect(bloqueoDeCargaPlanAula({ ...base, anioCerrado: true })).toBe('ANIO_CERRADO');
  });

  it('un periodo sin ventana configurada no frena la carga', () => {
    expect(bloqueoDeCargaPlanAula({ ...base, ventana: null })).toBeNull();
  });
});

describe('transiciones del plan', () => {
  it('sin cargar nace en revisión (o aprobado, si se adopta); revisión decide; devuelto vuelve a revisión; aprobado solo se reabre', () => {
    expect(siguienteEstado('SIN_CARGAR', 'RADICAR')).toBe('EN_REVISION');
    expect(siguienteEstado('SIN_CARGAR', 'ADOPTAR')).toBe('APROBADO');
    expect(siguienteEstado('EN_REVISION', 'APROBAR')).toBe('APROBADO');
    expect(siguienteEstado('EN_REVISION', 'DEVOLVER')).toBe('DEVUELTO');
    expect(siguienteEstado('DEVUELTO', 'RADICAR')).toBe('EN_REVISION');
    expect(siguienteEstado('APROBADO', 'REABRIR')).toBe('DEVUELTO');
  });

  it('lo que no está en la tabla no se puede', () => {
    expect(siguienteEstado('EN_REVISION', 'RADICAR')).toBeNull();
    expect(siguienteEstado('APROBADO', 'RADICAR')).toBeNull();
    expect(siguienteEstado('APROBADO', 'DEVOLVER')).toBeNull();
    expect(siguienteEstado('DEVUELTO', 'APROBAR')).toBeNull();
    expect(siguienteEstado('SIN_CARGAR', 'APROBAR')).toBeNull();
    expect(siguienteEstado('EN_REVISION', 'REABRIR')).toBeNull();
  });

  it('todos los estados que se pueden ver tienen su fila', () => {
    expect(Object.keys(TRANSICIONES_PLAN).sort()).toEqual(['APROBADO', 'DEVUELTO', 'EN_REVISION', 'SIN_CARGAR']);
  });
});

describe('motivoAreaPendiente (qué frena la activación del año)', () => {
  it('un área con plan aprobado no frena nada', () => {
    expect(motivoAreaPendiente(true, 'APROBADO')).toBeNull();
    expect(motivoAreaPendiente(false, 'APROBADO')).toBeNull();
  });

  it('sin plan: distingue si falta el líder o si falta que el líder lo cargue', () => {
    expect(motivoAreaPendiente(false, 'SIN_CARGAR')).toBe('SIN_LIDER');
    expect(motivoAreaPendiente(true, 'SIN_CARGAR')).toBe('SIN_CARGAR');
  });

  it('con plan, el motivo es su estado', () => {
    expect(motivoAreaPendiente(true, 'EN_REVISION')).toBe('EN_REVISION');
    expect(motivoAreaPendiente(true, 'DEVUELTO')).toBe('DEVUELTO');
  });
});

describe('asignaturasPorGrado', () => {
  const id = (s: string) => ({ toString: () => s });

  it('junta por grado las de la malla y las que un grupo o una jornada de ese grado agregan, sin repetir', () => {
    const porGrado = asignaturasPorGrado({
      grades: [
        {
          grade_id: id('g6'),
          asignaturas: [{ subject_id: id('mat') }, { subject_id: id('len') }],
          personalizaciones_grupo: [{ asignaturas_agregadas: [{ subject_id: id('rob') }] }],
          jornadas_personalizadas: [{ asignaturas_agregadas: [{ subject_id: id('mat') }, { subject_id: id('ing') }] }],
        },
        { grade_id: id('g1'), asignaturas: [{ subject_id: id('mat') }], personalizaciones_grupo: [] },
      ],
    });
    expect([...porGrado.get('g6')!].sort()).toEqual(['ing', 'len', 'mat', 'rob']);
    expect([...porGrado.get('g1')!]).toEqual(['mat']);
  });

  it('sin plan de estudios no hay asignaturas', () => {
    expect(asignaturasPorGrado(null).size).toBe(0);
  });
});

describe('planesAdoptables: solo el plan aprobado de quien ya no dicta esa asignatura', () => {
  const plan = (docente_id: string, estado: 'APROBADO' | 'EN_REVISION' | 'DEVUELTO', archivado: boolean) => ({ docente_id, estado, archivado });

  it('adopta el aprobado de un docente que se fue', () => {
    expect(planesAdoptables([plan('ana', 'APROBADO', true)], 'luis')).toHaveLength(1);
  });

  it('no el de un colega que sigue dictando la asignatura, ni el propio, ni uno sin aprobar', () => {
    expect(planesAdoptables([plan('ana', 'APROBADO', false)], 'luis')).toEqual([]);
    expect(planesAdoptables([plan('luis', 'APROBADO', true)], 'luis')).toEqual([]);
    expect(planesAdoptables([plan('ana', 'EN_REVISION', true), plan('ana', 'DEVUELTO', true)], 'luis')).toEqual([]);
  });
});
