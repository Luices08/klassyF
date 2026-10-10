import { describe, expect, it } from 'vitest';
import {
  ActividadDelGrupo,
  EntradaCalendario,
  diaCalendarioColombia,
  estadoDeEntrega,
  evaluarCalendarioActividad,
  evaluarVentanaEntrega,
  normalizarTexto,
} from '../src/utils/actividades';
import { detectarEvidencia } from '../src/utils/evidenciasActividad';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('estadoDeEntrega', () => {
  const entrega = { estado: 'ENTREGADA' as const, calificacion_numerica: null, fecha_entrega: new Date('2026-03-02T15:00:00Z') };

  it('sin entrega la actividad está programada', () => {
    expect(estadoDeEntrega(null)).toBe('PROGRAMADA');
  });

  it('recorre programada -> entregada -> entregada con retraso -> calificada', () => {
    expect(estadoDeEntrega(entrega)).toBe('ENTREGADA');
    expect(estadoDeEntrega({ ...entrega, estado: 'ENTREGADA_TARDE' })).toBe('ENTREGADA_TARDE');
    expect(estadoDeEntrega({ ...entrega, estado: 'ENTREGADA_TARDE', calificacion_numerica: 4.2 })).toBe('CALIFICADA');
  });

  it('una nota de 0 sigue siendo calificada', () => {
    expect(estadoDeEntrega({ ...entrega, calificacion_numerica: 0 })).toBe('CALIFICADA');
  });

  it('un registro sin fecha de entrega (nota puesta por el docente) no cuenta como entregado', () => {
    expect(estadoDeEntrega({ estado: 'ENTREGADA', calificacion_numerica: null, fecha_entrega: null })).toBe('PROGRAMADA');
  });

  it('un registro anterior a M11, sin campo estado pero con nota, es calificado', () => {
    expect(estadoDeEntrega({ calificacion_numerica: 3.5, fecha_entrega: new Date() })).toBe('CALIFICADA');
  });
});

describe('evaluarVentanaEntrega', () => {
  const plazos = {
    fecha_apertura: new Date('2026-03-02T13:00:00Z'),
    fecha_entrega: new Date('2026-03-06T23:00:00Z'),
    permite_entrega_tardia: false,
  };

  it('antes de la publicación no se ve ni se entrega', () => {
    const v = evaluarVentanaEntrega(plazos, new Date('2026-03-01T12:00:00Z'));
    expect(v).toMatchObject({ publicada: false, abierta: false });
    expect(v.motivo).toMatch(/se publica/);
  });

  it('dentro del plazo es una entrega a tiempo', () => {
    expect(evaluarVentanaEntrega(plazos, new Date('2026-03-06T22:59:00Z'))).toMatchObject({ abierta: true, tardia: false, vencida: false });
  });

  it('vencido el plazo, sin entrega tardía, se cierra', () => {
    const v = evaluarVentanaEntrega(plazos, new Date('2026-03-07T00:00:00Z'));
    expect(v).toMatchObject({ publicada: true, vencida: true, abierta: false });
    expect(v.motivo).toMatch(/no recibe entregas tardías/);
  });

  it('vencido el plazo, con entrega tardía, sigue abierto pero la entrega queda tardía', () => {
    expect(evaluarVentanaEntrega({ ...plazos, permite_entrega_tardia: true }, new Date('2026-03-09T12:00:00Z'))).toMatchObject({
      abierta: true,
      tardia: true,
      vencida: true,
    });
  });
});

describe('diaCalendarioColombia', () => {
  it('las 11 pm en Colombia siguen siendo ese día aunque en UTC ya sea el siguiente', () => {
    expect(diaCalendarioColombia(new Date('2026-03-07T04:00:00Z')).toISOString()).toBe('2026-03-06T00:00:00.000Z');
  });

  it('la medianoche en Colombia ya es el día nuevo', () => {
    expect(diaCalendarioColombia(new Date('2026-03-06T05:00:00Z')).toISOString()).toBe('2026-03-06T00:00:00.000Z');
  });
});

describe('evaluarCalendarioActividad', () => {
  // viernes 6 de marzo de 2026, 5 pm en Colombia
  const viernes = new Date('2026-03-06T22:00:00Z');
  const base = (extra: Partial<EntradaCalendario> = {}): EntradaCalendario => ({
    ahora: new Date('2026-03-02T15:00:00Z'),
    fecha_entrega: viernes,
    tipo: 'TAREA',
    exigir_futuro: true,
    periodo: { numero: 1, fecha_inicio: new Date('2026-01-19T00:00:00Z'), fecha_fin: new Date('2026-04-03T00:00:00Z') },
    eventos: [],
    dias_habiles: [1, 2, 3, 4, 5],
    del_grupo: [],
    limites: { max_evaluaciones_por_dia: 2, max_entregas_por_dia: 4 },
    ...extra,
  });
  const delGrupo = (tipo: ActividadDelGrupo['tipo'], asignatura = 'Matemáticas'): ActividadDelGrupo => ({
    titulo: 'x',
    tipo,
    asignatura,
    fecha_entrega: new Date('2026-03-06T15:00:00Z'),
  });

  it('una fecha normal no genera alertas', () => {
    expect(evaluarCalendarioActividad(base())).toEqual([]);
  });

  it('una entrega en el pasado se bloquea, pero una actividad de aula ya registrada no', () => {
    const pasada = new Date('2026-03-02T14:00:00Z');
    expect(evaluarCalendarioActividad(base({ fecha_entrega: pasada }))).toMatchObject([{ codigo: 'FECHA_PASADA', severidad: 'BLOQUEO' }]);
    expect(evaluarCalendarioActividad(base({ fecha_entrega: pasada, exigir_futuro: false }))).toEqual([]);
  });

  it('fuera del periodo se bloquea', () => {
    const alertas = evaluarCalendarioActividad(base({ fecha_entrega: new Date('2026-04-06T22:00:00Z') }));
    expect(alertas).toMatchObject([{ codigo: 'FUERA_DE_PERIODO', severidad: 'BLOQUEO' }]);
  });

  it('el último día del periodo cuenta en hora de Colombia aunque en UTC ya sea el siguiente', () => {
    // viernes 3 de abril, 10 pm en Colombia = sábado 4 de abril, 3 am en UTC
    expect(evaluarCalendarioActividad(base({ fecha_entrega: new Date('2026-04-04T03:00:00Z') }))).toEqual([]);
  });

  it('un receso o vacaciones advierte con el nombre del evento', () => {
    const eventos = [
      {
        tipo: 'RECESO' as const,
        nombre: 'Semana Santa',
        fecha_inicio: new Date('2026-03-02T00:00:00Z'),
        fecha_fin: new Date('2026-03-08T00:00:00Z'),
      },
    ];
    const alertas = evaluarCalendarioActividad(base({ eventos }));
    expect(alertas).toMatchObject([{ codigo: 'DIA_NO_LECTIVO', severidad: 'ADVERTENCIA' }]);
    expect(alertas[0]?.mensaje).toContain('Semana Santa');
  });

  it('un día fuera de los días hábiles de la jornada advierte (un sábado en una jornada de lunes a viernes)', () => {
    const sabado = new Date('2026-03-07T17:00:00Z');
    expect(evaluarCalendarioActividad(base({ fecha_entrega: sabado }))).toMatchObject([{ codigo: 'DIA_NO_HABIL' }]);
    expect(evaluarCalendarioActividad(base({ fecha_entrega: sabado, dias_habiles: [6] }))).toEqual([]);
  });

  it('una ventana de recuperación advierte', () => {
    const eventos = [
      {
        tipo: 'RECUPERACION_PERIODO' as const,
        nombre: 'Recuperaciones del periodo 1',
        periodo_numero: 1,
        fecha_inicio: new Date('2026-03-06T00:00:00Z'),
        fecha_fin: new Date('2026-03-06T00:00:00Z'),
      },
    ];
    expect(evaluarCalendarioActividad(base({ eventos }))).toMatchObject([{ codigo: 'VENTANA_RECUPERACION' }]);
  });

  it('una evaluación de más en el día del límite advierte; una tarea no cuenta como evaluación', () => {
    const dosExamenes = [delGrupo('EVALUACION', 'Matemáticas'), delGrupo('EVALUACION', 'Inglés')];
    const alertas = evaluarCalendarioActividad(base({ tipo: 'EVALUACION', del_grupo: dosExamenes }));
    expect(alertas).toMatchObject([{ codigo: 'SOBRECARGA_EVALUACIONES', severidad: 'ADVERTENCIA' }]);
    expect(alertas[0]?.mensaje).toContain('Matemáticas, Inglés');

    expect(evaluarCalendarioActividad(base({ tipo: 'TAREA', del_grupo: dosExamenes }))).toEqual([]);
    expect(evaluarCalendarioActividad(base({ tipo: 'EVALUACION', del_grupo: [delGrupo('EVALUACION')] }))).toEqual([]);
  });

  it('actividades de otro día no cuentan', () => {
    const otroDia = { ...delGrupo('EVALUACION'), fecha_entrega: new Date('2026-03-05T15:00:00Z') };
    expect(evaluarCalendarioActividad(base({ tipo: 'EVALUACION', del_grupo: [otroDia, otroDia] }))).toEqual([]);
  });

  it('el límite total del día advierte, y 0 desactiva el límite', () => {
    const cuatro = [delGrupo('TAREA'), delGrupo('TAREA'), delGrupo('TRABAJO'), delGrupo('PROYECTO')];
    expect(evaluarCalendarioActividad(base({ del_grupo: cuatro }))).toMatchObject([{ codigo: 'SOBRECARGA_ENTREGAS' }]);
    expect(
      evaluarCalendarioActividad(base({ del_grupo: cuatro, limites: { max_evaluaciones_por_dia: 0, max_entregas_por_dia: 0 } }))
    ).toEqual([]);
  });

  it('los bloqueos van primero', () => {
    const alertas = evaluarCalendarioActividad(base({ fecha_entrega: new Date('2026-04-06T17:00:00Z'), dias_habiles: [2] }));
    expect(alertas.map((a) => a.severidad)).toEqual(['BLOQUEO', 'ADVERTENCIA']);
  });
});

describe('normalizarTexto', () => {
  it('ignora tildes, mayúsculas y espacios repetidos', () => {
    expect(normalizarTexto('  Resuelve   problemas de Comparación ')).toBe('resuelve problemas de comparacion');
  });
});

describe('detectarEvidencia', () => {
  const zip = (carpeta: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`...${carpeta}document.xml...`)]);

  it('reconoce PDF e imágenes por su firma, no por el nombre', () => {
    expect(detectarEvidencia('application/pdf', 'x.pdf', Buffer.from('%PDF-1.4 hola'))).toMatchObject({ formato: 'PDF', ext: '.pdf' });
    expect(detectarEvidencia('image/png', 'x.png', Buffer.from('89504e470d0a1a0a', 'hex'))).toMatchObject({ formato: 'IMAGEN', ext: '.png' });
    expect(detectarEvidencia('application/pdf', 'x.pdf', Buffer.from('no soy un pdf'))).toBeNull();
  });

  it('un .docx real se acepta, un ZIP cualquiera con nombre de Word no', () => {
    expect(detectarEvidencia(DOCX, 'tarea.docx', zip('word/'))).toMatchObject({ formato: 'WORD', ext: '.docx' });
    expect(detectarEvidencia(DOCX, 'tarea.docx', zip('otra/'))).toBeNull();
  });

  it('exige que la extensión coincida con el tipo declarado', () => {
    expect(detectarEvidencia(DOCX, 'tarea.xlsx', zip('word/'))).toBeNull();
    expect(
      detectarEvidencia('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'datos.xlsx', zip('xl/'))
    ).toMatchObject({ formato: 'EXCEL' });
  });

  it('rechaza un ejecutable que declara ser PDF', () => {
    expect(detectarEvidencia('application/pdf', 'virus.pdf', Buffer.from('MZ\x90\x00'))).toBeNull();
  });
});
