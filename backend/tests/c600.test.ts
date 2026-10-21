import { describe, expect, it } from 'vitest';
import { MatriculaC600, armarBalance, armarEdades, armarResultados, claveDeEdad, desdeFechaIso, edadCumplida, etiquetaDeEdad, hayOtroSinDato, sexoDeC600 } from '../src/utils/c600';

const grados = [
  { grado_id: 'g6', grado: 'Sexto', grado_numero: 6 },
  { grado_id: 'g0', grado: 'Transición', grado_numero: 0 },
];

const m = (extra: Partial<MatriculaC600>): MatriculaC600 => ({ grado_id: 'g6', sexo: 'H', situacion: 'ACTIVA', ingreso_tardio: false, clasificacion: null, nacimiento: null, ...extra });
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('sexoDeC600', () => {
  it('M es hombre, F es mujer y lo demás (o sin dato) va aparte', () => {
    expect(sexoDeC600('M')).toBe('H');
    expect(sexoDeC600('F')).toBe('M');
    expect(sexoDeC600('OTRO')).toBe('O');
    expect(sexoDeC600(undefined)).toBe('O');
    expect(sexoDeC600(null)).toBe('O');
  });
});

describe('edadCumplida', () => {
  it('cuenta los años completos a la fecha de corte', () => {
    expect(edadCumplida(d('2018-07-15'), d('2026-02-01'))).toBe(7);
    expect(edadCumplida(d('2018-07-15'), d('2026-08-01'))).toBe(8);
  });

  it('el día del cumpleaños ya los cumplió', () => {
    expect(edadCumplida(d('2018-07-15'), d('2026-07-15'))).toBe(8);
    expect(edadCumplida(d('2018-07-15'), d('2026-07-14'))).toBe(7);
  });

  it('un nacimiento el 29 de febrero se cumple al llegar al 1 de marzo en años no bisiestos', () => {
    expect(edadCumplida(d('2016-02-29'), d('2026-02-28'))).toBe(9);
    expect(edadCumplida(d('2016-02-29'), d('2026-03-01'))).toBe(10);
  });
});

describe('claves de edad', () => {
  it('de 4 a 17 una por una, 18 o más juntas y menos de 4 aparte', () => {
    expect(claveDeEdad(3)).toBe('<4');
    expect(claveDeEdad(4)).toBe('4');
    expect(claveDeEdad(17)).toBe('17');
    expect(claveDeEdad(18)).toBe('18+');
    expect(claveDeEdad(25)).toBe('18+');
    expect(etiquetaDeEdad('18+')).toBe('18 años o más');
    expect(etiquetaDeEdad('<4')).toBe('Menos de 4 años');
    expect(etiquetaDeEdad('9')).toBe('9 años');
  });
});

describe('armarBalance', () => {
  const matriculas = [
    m({}),
    m({}),
    m({ situacion: 'RETIRADA' }),
    m({ ingreso_tardio: true }),
    m({ ingreso_tardio: true, situacion: 'RETIRADA' }),
    m({ grado_id: 'g0' }),
  ];

  it('inicial + ingresados − retirados = final, grado por grado y en el total', () => {
    const { filas, total } = armarBalance(grados, matriculas);
    expect(filas.map((f) => f.grado_numero)).toEqual([0, 6]);
    const sexto = filas.find((f) => f.grado_id === 'g6')!;
    expect(sexto).toMatchObject({ matricula_inicial: 3, ingresados: 2, retirados: 2, matricula_final: 3 });
    for (const f of filas) expect(f.matricula_inicial + f.ingresados - f.retirados).toBe(f.matricula_final);
    expect(total).toEqual({ matricula_inicial: 4, ingresados: 2, retirados: 2, matricula_final: 4 });
  });

  it('un grado sin matrículas sale en ceros, como en el formulario', () => {
    expect(armarBalance(grados, []).filas.every((f) => f.matricula_final === 0)).toBe(true);
  });
});

describe('armarResultados', () => {
  it('reparte por resultado y sexo; los retirados son los desertores; sin resultado final queda aparte', () => {
    const { filas, total } = armarResultados(grados, [
      m({ clasificacion: 'PROMOVIDO', sexo: 'H' }),
      m({ clasificacion: 'PROMOVIDO', sexo: 'M' }),
      m({ clasificacion: 'NO_PROMOVIDO', sexo: 'M' }),
      m({ clasificacion: 'PENDIENTE', sexo: 'H' }),
      m({ clasificacion: 'SIN_NOTAS', sexo: 'O' }),
      m({ situacion: 'RETIRADA', sexo: 'H' }),
      m({ grado_id: 'g0', clasificacion: 'PROMOVIDO', sexo: 'O' }),
    ]);
    const sexto = filas.find((f) => f.grado_id === 'g6')!;
    expect(sexto.promovidos).toEqual({ H: 1, M: 1, O: 0, total: 2 });
    expect(sexto.no_promovidos).toEqual({ H: 0, M: 1, O: 0, total: 1 });
    expect(sexto.desertores).toEqual({ H: 1, M: 0, O: 0, total: 1 });
    expect(sexto.sin_resultado).toBe(2);
    expect(total.promovidos.total).toBe(3);
    expect(total.promovidos.O).toBe(1);
    expect(total.sin_resultado).toBe(2);
  });
});

describe('armarEdades', () => {
  const corte = d('2026-02-01');

  it('siempre trae las edades de 4 a 18 o más, aunque estén en cero', () => {
    const { filas } = armarEdades(grados, [], corte);
    expect(filas.map((f) => f.clave)).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18+']);
  });

  it('cuenta solo a los matriculados al cierre, por edad, grado y sexo', () => {
    const { filas, total_por_grado, sin_fecha_nacimiento } = armarEdades(
      grados,
      [
        m({ nacimiento: d('2014-03-10'), sexo: 'H' }),
        m({ nacimiento: d('2014-03-10'), sexo: 'M' }),
        m({ nacimiento: d('2013-01-01'), sexo: 'H' }),
        m({ nacimiento: d('2014-03-10'), situacion: 'RETIRADA' }),
        m({ nacimiento: null }),
        m({ grado_id: 'g0', nacimiento: d('2021-05-05'), sexo: 'O' }),
      ],
      corte
    );
    const once = filas.find((f) => f.clave === '11')!;
    expect(once.celdas.g6).toEqual({ H: 1, M: 1, O: 0, total: 2 });
    expect(filas.find((f) => f.clave === '13')!.celdas.g6.H).toBe(1);
    expect(filas.find((f) => f.clave === '4')!.celdas.g0.O).toBe(1);
    expect(total_por_grado.g6.total).toBe(3);
    expect(sin_fecha_nacimiento).toBe(1);
  });

  it('«menos de 4» y «18 o más» solo salen cuando corresponde', () => {
    const { filas } = armarEdades(grados, [m({ nacimiento: d('2024-01-01') }), m({ nacimiento: d('2005-01-01') })], corte);
    expect(filas[0]?.clave).toBe('<4');
    expect(filas.at(-1)).toMatchObject({ clave: '18+', total: { total: 1 } });
  });
});

describe('hayOtroSinDato', () => {
  it('solo se agrega la columna cuando alguien quedó sin sexo H o M', () => {
    const edades = armarEdades(grados, [], d('2026-02-01'));
    const sin = armarResultados(grados, [m({ clasificacion: 'PROMOVIDO', sexo: 'H' })]);
    const con = armarResultados(grados, [m({ clasificacion: 'PROMOVIDO', sexo: 'O' })]);
    expect(hayOtroSinDato(sin, edades)).toBe(false);
    expect(hayOtroSinDato(con, edades)).toBe(true);
  });
});

describe('desdeFechaIso', () => {
  it('acepta un día de calendario válido y rechaza lo demás', () => {
    expect(desdeFechaIso('2026-02-01')?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(desdeFechaIso('2026-02-30')).toBeNull();
    expect(desdeFechaIso('01/02/2026')).toBeNull();
    expect(desdeFechaIso('')).toBeNull();
  });
});
