import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/constants/roles';
import { acumuladoDeNotas, periodosDelRetiro, PeriodoParaRetiro } from '../src/utils/boletinRetiro';
import {
  aDiaDeCalendario,
  cupoDebeLiberarse,
  estadoGlobalDePazYSalvo,
  grupoEnFecha,
  motivoFechaEfectivaInvalida,
  resolverAccionDependencia,
} from '../src/utils/salidas';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('fecha efectiva de la salida', () => {
  const hoy = dia('2026-05-20');
  const matricula = dia('2026-01-20');

  it('acepta hoy y días anteriores desde la matrícula', () => {
    expect(motivoFechaEfectivaInvalida(dia('2026-05-20'), matricula, hoy)).toBeNull();
    expect(motivoFechaEfectivaInvalida(dia('2026-03-02'), matricula, hoy)).toBeNull();
    expect(motivoFechaEfectivaInvalida(dia('2026-01-20'), matricula, hoy)).toBeNull();
  });

  it('rechaza una fecha futura: la desvinculación es inmediata, no programada', () => {
    expect(motivoFechaEfectivaInvalida(dia('2026-05-21'), matricula, hoy)).toMatch(/futura/);
  });

  it('rechaza una fecha anterior a la matrícula', () => {
    expect(motivoFechaEfectivaInvalida(dia('2026-01-19'), matricula, hoy)).toMatch(/anterior a la fecha de la matrícula/);
  });

  it('compara por día de calendario aunque la matrícula traiga hora', () => {
    expect(motivoFechaEfectivaInvalida(dia('2026-01-20'), new Date('2026-01-20T15:30:00.000Z'), hoy)).toBeNull();
  });

  it('una matrícula formalizada pasadas las 7 p.m. en Colombia (ya es el día siguiente en UTC) admite la salida de esa misma noche', () => {
    const formalizada = new Date('2026-01-21T00:40:00.000Z'); // 19:40 del 20 de enero en Colombia
    expect(motivoFechaEfectivaInvalida(dia('2026-01-20'), formalizada, hoy)).toBeNull();
    expect(motivoFechaEfectivaInvalida(dia('2026-01-19'), formalizada, hoy)).toMatch(/anterior a la fecha de la matrícula/);
  });

  it('normaliza a medianoche UTC', () => {
    expect(aDiaDeCalendario('2026-03-02').toISOString()).toBe('2026-03-02T00:00:00.000Z');
    expect(aDiaDeCalendario(new Date('2026-03-02T17:45:00.000Z')).toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });
});

describe('estado del paz y salvo de salida', () => {
  const d = (...estados: Array<'PENDIENTE' | 'BLOQUEADO' | 'APROBADO'>) => estados.map((estado) => ({ estado }));

  it('sin dependencias no hay nada pendiente', () => {
    expect(estadoGlobalDePazYSalvo([])).toBe('APROBADO');
  });
  it('aprobado solo con todas aprobadas', () => {
    expect(estadoGlobalDePazYSalvo(d('APROBADO', 'APROBADO'))).toBe('APROBADO');
    expect(estadoGlobalDePazYSalvo(d('APROBADO', 'PENDIENTE'))).toBe('PENDIENTE');
  });
  it('una bloqueada lo bloquea aunque las demás estén aprobadas o pendientes', () => {
    expect(estadoGlobalDePazYSalvo(d('APROBADO', 'BLOQUEADO'))).toBe('BLOQUEADO');
    expect(estadoGlobalDePazYSalvo(d('PENDIENTE', 'BLOQUEADO'))).toBe('BLOQUEADO');
  });
});

describe('acciones sobre una dependencia', () => {
  const accion = (actual: 'PENDIENTE' | 'BLOQUEADO' | 'APROBADO', a: 'APROBACION' | 'BLOQUEO' | 'EXCEPCION' | 'ANULACION', rol = ROLES.SECRETARIA, motivo = 'Libro «El Principito» sin devolver') =>
    resolverAccionDependencia(actual, { accion: a, rol, motivo });

  it('aprobar es posible desde pendiente y desde bloqueada (saldó la deuda), no si ya está aprobada', () => {
    expect(accion('PENDIENTE', 'APROBACION', ROLES.COORDINADOR, '')).toEqual({ estado: 'APROBADO', excepcion: false });
    expect(accion('BLOQUEADO', 'APROBACION', ROLES.COORDINADOR, '')).toEqual({ estado: 'APROBADO', excepcion: false });
    expect(accion('APROBADO', 'APROBACION')).toMatchObject({ estatus: 409 });
  });

  it('bloquear exige decir qué se debe', () => {
    expect(accion('PENDIENTE', 'BLOQUEO')).toEqual({ estado: 'BLOQUEADO', excepcion: false });
    expect(accion('PENDIENTE', 'BLOQUEO', ROLES.COORDINADOR, '  ')).toMatchObject({ estatus: 400, error: expect.stringMatching(/deuda o material/) });
    expect(accion('APROBADO', 'BLOQUEO')).toMatchObject({ estatus: 409, error: expect.stringMatching(/anula la aprobación/) });
  });

  it('la excepción solo aplica a una bloqueada y solo la autoriza Rectoría o Secretaría, con motivo', () => {
    expect(accion('BLOQUEADO', 'EXCEPCION', ROLES.ADMIN, 'Convenio de pago firmado')).toEqual({ estado: 'APROBADO', excepcion: true });
    expect(accion('BLOQUEADO', 'EXCEPCION', ROLES.SECRETARIA, 'Convenio de pago firmado')).toEqual({ estado: 'APROBADO', excepcion: true });
    expect(accion('BLOQUEADO', 'EXCEPCION', ROLES.COORDINADOR, 'Convenio de pago firmado')).toMatchObject({ estatus: 403 });
    expect(accion('PENDIENTE', 'EXCEPCION', ROLES.ADMIN, 'Convenio de pago firmado')).toMatchObject({ estatus: 409 });
    expect(accion('BLOQUEADO', 'EXCEPCION', ROLES.ADMIN, '')).toMatchObject({ estatus: 400 });
  });

  it('anular una aprobación la devuelve a pendiente, solo Rectoría o Secretaría y con motivo', () => {
    expect(accion('APROBADO', 'ANULACION', ROLES.ADMIN, 'Se aprobó por error')).toEqual({ estado: 'PENDIENTE', excepcion: false });
    expect(accion('APROBADO', 'ANULACION', ROLES.COORDINADOR, 'Se aprobó por error')).toMatchObject({ estatus: 403 });
    expect(accion('PENDIENTE', 'ANULACION', ROLES.ADMIN, 'Se aprobó por error')).toMatchObject({ estatus: 409 });
    expect(accion('APROBADO', 'ANULACION', ROLES.ADMIN, '')).toMatchObject({ estatus: 400 });
  });
});

describe('liberación del cupo', () => {
  it('con la política inmediata se libera siempre, una sola vez', () => {
    expect(cupoDebeLiberarse('INMEDIATA', 'PENDIENTE', false)).toBe(true);
    expect(cupoDebeLiberarse('INMEDIATA', 'PENDIENTE', true)).toBe(false);
  });
  it('con la política de paz y salvo espera a que esté aprobado', () => {
    expect(cupoDebeLiberarse('AL_APROBAR_PAZ_Y_SALVO', 'PENDIENTE', false)).toBe(false);
    expect(cupoDebeLiberarse('AL_APROBAR_PAZ_Y_SALVO', 'BLOQUEADO', false)).toBe(false);
    expect(cupoDebeLiberarse('AL_APROBAR_PAZ_Y_SALVO', 'APROBADO', false)).toBe(true);
    expect(cupoDebeLiberarse('AL_APROBAR_PAZ_Y_SALVO', 'APROBADO', true)).toBe(false);
  });
});

describe('trayectoria por grupo', () => {
  const tramos = [
    { group_id: 'A', desde: dia('2026-01-20'), hasta: dia('2026-03-10') },
    { group_id: 'B', desde: dia('2026-03-11'), hasta: dia('2026-05-02') },
  ];
  it('dice en qué grupo estaba un día, con el último día de cada tramo incluido', () => {
    expect(grupoEnFecha(tramos, dia('2026-02-01'))).toBe('A');
    expect(grupoEnFecha(tramos, dia('2026-03-10'))).toBe('A');
    expect(grupoEnFecha(tramos, dia('2026-04-01'))).toBe('B');
    expect(grupoEnFecha(tramos, new Date('2026-05-02T20:00:00.000Z'))).toBe('B');
  });
  it('fuera de la matrícula no estaba en ninguno', () => {
    expect(grupoEnFecha(tramos, dia('2026-01-01'))).toBeNull();
    expect(grupoEnFecha(tramos, dia('2026-05-03'))).toBeNull();
  });
  it('un tramo abierto sigue vigente', () => {
    expect(grupoEnFecha([{ group_id: 'A', desde: dia('2026-01-20'), hasta: null }], dia('2026-09-01'))).toBe('A');
  });
});

describe('periodos del boletín parcial de retiro', () => {
  const periodo = (numero: number, estado: string, inicio: string, fin: string, porcentaje = 25): PeriodoParaRetiro => ({
    numero,
    nombre: `Periodo ${numero}`,
    estado,
    fecha_inicio: dia(inicio),
    fecha_fin: dia(fin),
    porcentaje,
  });
  const anio = [
    periodo(1, 'CERRADO', '2026-01-20', '2026-03-27'),
    periodo(2, 'CERRADO', '2026-04-06', '2026-06-12'),
    periodo(3, 'ABIERTO', '2026-07-06', '2026-09-11'),
    periodo(4, 'PROGRAMADO', '2026-09-21', '2026-11-27'),
  ];

  it('los cerrados son oficiales y el periodo en curso es corte solo si el SIEE lo permite', () => {
    const permitido = periodosDelRetiro(anio, dia('2026-08-10'), true);
    expect(permitido.oficiales.map((p) => p.numero)).toEqual([1, 2]);
    expect(permitido.corte?.numero).toBe(3);
    expect(permitido.omitido).toBeNull();

    const noPermitido = periodosDelRetiro(anio, dia('2026-08-10'), false);
    expect(noPermitido.oficiales.map((p) => p.numero)).toEqual([1, 2]);
    expect(noPermitido.corte).toBeNull();
    expect(noPermitido.omitido?.numero).toBe(3);
  });

  it('un periodo que empezó después de la salida no lo cursó, esté cerrado o no', () => {
    const salidaTemprana = periodosDelRetiro(anio, dia('2026-05-04'), true);
    expect(salidaTemprana.oficiales.map((p) => p.numero)).toEqual([1]);
    expect(salidaTemprana.corte?.numero).toBe(2);
    const dentroDelP1 = periodosDelRetiro([periodo(1, 'CERRADO', '2026-01-20', '2026-03-27'), periodo(2, 'CERRADO', '2026-04-06', '2026-06-12')], dia('2026-02-10'), true);
    // Salió en pleno periodo 1: ese periodo no lo completó (aunque luego se cierre), el periodo 2 ni siquiera empezó.
    expect(dentroDelP1.oficiales).toEqual([]);
    expect(dentroDelP1.corte?.numero).toBe(1);
  });

  it('un periodo que terminó pero aún no se cierra no es oficial todavía', () => {
    const enDigitacion = [periodo(1, 'CERRADO', '2026-01-20', '2026-03-27'), periodo(2, 'EN_DIGITACION', '2026-04-06', '2026-06-12')];
    const r = periodosDelRetiro(enDigitacion, dia('2026-06-20'), false);
    expect(r.oficiales.map((p) => p.numero)).toEqual([1]);
    expect(r.omitido?.numero).toBe(2);
  });

  it('antes de empezar el año no hay nada', () => {
    const r = periodosDelRetiro(anio, dia('2026-01-05'), true);
    expect(r.oficiales).toEqual([]);
    expect(r.corte).toBeNull();
  });

  it('el acumulado pondera por el porcentaje de los periodos incluidos', () => {
    // P1 vale 20% y P2 30%: sobre 50%, la nota es (4.0*20 + 3.0*30) / 50 = 3.4.
    expect(acumuladoDeNotas([{ nota: 4, exenta: false }, { nota: 3, exenta: false }], [20, 30])).toBe(3.4);
  });

  it('sin una nota oficial no hay acumulado, y un periodo exento no entra', () => {
    expect(acumuladoDeNotas([{ nota: 4, exenta: false }, { nota: null, exenta: false }], [25, 25])).toBeNull();
    expect(acumuladoDeNotas([{ nota: null, exenta: true }, { nota: 4.2, exenta: false }], [25, 25])).toBe(4.2);
    expect(acumuladoDeNotas([], [])).toBeNull();
  });
});
