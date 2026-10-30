import { describe, expect, it } from 'vitest';
import { GRUPOS_SISBEN, normalizarGrupoSisben } from '../src/constants/sisben';
import {
  cambiosDeEstudiante,
  detectarDelimitadorSimat,
  discapacidadDeSimat,
  documentoDeCelda,
  estratoDeSimat,
  etniaDeSimat,
  fechaDeCelda,
  fechaHoraDeCelda,
  FilaSimat,
  gradoEsSoportado,
  jornadaDeSimat,
  llaveDeGrupoSimat,
  mapearColumnas,
  normalizarEncabezadoSimat,
  normalizarFila,
  ordenarParaFolio,
  sangreDeSimat,
  telefonoDeSimat,
  tipoDocumentoDeSimat,
} from '../src/utils/importacionSimat';

// Todo con casos sintéticos: el archivo real de SIMAT trae documentos y datos de salud de menores y no se usa como fixture.

describe('SISBEN: grupos', () => {
  it('son los 51 grupos A1–A5, B1–B7, C1–C18 y D1–D21', () => {
    expect(GRUPOS_SISBEN).toHaveLength(5 + 7 + 18 + 21);
    expect(GRUPOS_SISBEN).toContain('A1');
    expect(GRUPOS_SISBEN).toContain('D21');
    expect(GRUPOS_SISBEN).not.toContain('A6');
    expect(GRUPOS_SISBEN).not.toContain('D22');
  });

  it('normaliza mayúsculas y espacios; «NO APLICA» y vacío son «sin SISBEN»; lo demás es inválido', () => {
    expect(normalizarGrupoSisben(' c 12 ')).toBe('C12');
    expect(normalizarGrupoSisben('a4')).toBe('A4');
    expect(normalizarGrupoSisben('NO APLICA')).toBeNull();
    expect(normalizarGrupoSisben('')).toBeNull();
    expect(normalizarGrupoSisben(null)).toBeNull();
    expect(normalizarGrupoSisben('Z9')).toBeUndefined();
    expect(normalizarGrupoSisben('A7')).toBeUndefined();
  });
});

describe('SIMAT: encabezados', () => {
  it('los lee por nombre, sin importar tildes, espacios, mayúsculas ni el orden', () => {
    const mapa = mapearColumnas(['Documento', 'tipo doc', 'Año', 'Estado', 'DANE', 'Código DANE Sede', 'Jornada', 'Grado_Cod', 'Grupo', 'Apellido1', 'Nombre1', 'Fecha_Nacimiento', 'SISBEN IV']);
    expect(mapa.faltantes).toEqual([]);
    expect(mapa.indices.documento).toBe(0);
    expect(mapa.indices.dane_sede).toBe(5);
    expect(mapa.indices.sisben).toBe(12);
  });

  it('dice qué obligatorias faltan y cuáles opcionales no vinieron', () => {
    const mapa = mapearColumnas(['ANO', 'ESTADO', 'DANE', 'DOC']);
    expect(mapa.faltantes).toContain('dane_sede');
    expect(mapa.faltantes).toContain('fecha_nacimiento');
    expect(mapa.opcionalesAusentes).toContain('sisben');
  });

  it('las columnas del SRPA no tienen alias: nunca se leen', () => {
    const mapa = mapearColumnas(['HA_ESTADO_VINCULADO_SRPA', 'ESTA_ACTIVO_SRPA']);
    expect(Object.keys(mapa.indices)).toEqual([]);
    expect(normalizarEncabezadoSimat('SISBEN IV')).toBe('SISBENIV');
  });
});

describe('SIMAT: valores de celda', () => {
  it('el documento es texto: número de Excel, NES con letras, «.0» sobrante', () => {
    expect(documentoDeCelda(1116379795)).toBe('1116379795');
    expect(documentoDeCelda('N48324894972')).toBe('N48324894972');
    expect(documentoDeCelda('1109672200.0')).toBe('1109672200');
    expect(documentoDeCelda(' 12 34 5678 ')).toBe('12345678');
    expect(documentoDeCelda('')).toBeNull();
    expect(documentoDeCelda('12')).toBeNull();
    expect(documentoDeCelda(-5)).toBeNull();
    expect(documentoDeCelda('AB-1234')).toBeNull();
  });

  it('el tipo de documento se lee por lo que está antes de los dos puntos (el PPT llega con la ñ dañada)', () => {
    expect(tipoDocumentoDeSimat('TI:TARJETA DE IDENTIDAD').tipo).toBe('TI');
    expect(tipoDocumentoDeSimat('RC:REGISTRO CIVIL DE NACIMIENTO').tipo).toBe('RC');
    expect(tipoDocumentoDeSimat('PPT: PERMISO DE PROTECCIÃ¿N TEMPORAL').tipo).toBe('PPT');
    expect(tipoDocumentoDeSimat('NES:NÚMERO ESTABLECIDO POR LA SECRETARÍA').tipo).toBe('NES');
    expect(tipoDocumentoDeSimat('CE:CÉDULA DE EXTRANJERÍA').tipo).toBe('CE');
    expect(tipoDocumentoDeSimat('VISA').tipo).toBeNull();
    expect(tipoDocumentoDeSimat('NUIP:NÚMERO UNICO DE IDENTIFICACIÓN PERSONAL').tipo).toBeNull();
  });

  it('las fechas llegan como serial de Excel, Date o texto', () => {
    expect(fechaDeCelda(40215)).toBe('2010-02-06');
    expect(fechaDeCelda(new Date('2010-02-06T00:00:00Z'))).toBe('2010-02-06');
    expect(fechaDeCelda('2010-02-06')).toBe('2010-02-06');
    expect(fechaDeCelda('06/02/2010')).toBe('2010-02-06');
    expect(fechaDeCelda('31/02/2010')).toBeNull();
    expect(fechaDeCelda('no es fecha')).toBeNull();
    expect(fechaDeCelda('')).toBeNull();
  });

  it('la hora de la matrícula en SIMAT es hora de Colombia: se lleva al instante real (UTC-5)', () => {
    // 22 de julio de 2025, 12:12:20 en Colombia = 17:12:20 UTC.
    expect(fechaHoraDeCelda(45860.508564814816)).toBe('2025-07-22T17:12:20.000Z');
  });

  it('el estrato 0 y «NO APLICA» no son un estrato de Klassy (1 a 6)', () => {
    expect(estratoDeSimat('ESTRATO 2')).toEqual({ valor: 2, cero: false });
    expect(estratoDeSimat('ESTRATO 6')).toEqual({ valor: 6, cero: false });
    expect(estratoDeSimat('ESTRATO 0')).toEqual({ valor: null, cero: true });
    expect(estratoDeSimat('NO APLICA')).toEqual({ valor: null, cero: false });
  });

  it('el tipo de sangre pierde el espacio', () => {
    expect(sangreDeSimat('O +')).toBe('O+');
    expect(sangreDeSimat('ab -')).toBe('AB-');
    expect(sangreDeSimat('')).toBeNull();
    expect(sangreDeSimat('X +')).toBeNull();
  });

  it('el teléfono toma el primer número utilizable de un campo con varios', () => {
    expect(telefonoDeSimat(3127984925)).toBe('3127984925');
    expect(telefonoDeSimat('3156716162/3217341666')).toBe('3156716162');
    expect(telefonoDeSimat('3195652098-3127979749')).toBe('3195652098');
    expect(telefonoDeSimat('3117409938/ 3108901445')).toBe('3117409938');
    expect(telefonoDeSimat('3184908267-6692545')).toBe('3184908267');
    expect(telefonoDeSimat('312 797 4925')).toBe('3127974925');
    expect(telefonoDeSimat('3156716162 3217341666')).toBe('3156716162');
    expect(telefonoDeSimat(6692545)).toBe('6692545');
    expect(telefonoDeSimat('573127984925')).toBe('3127984925');
    expect(telefonoDeSimat(0)).toBeNull();
    expect(telefonoDeSimat(693244)).toBeNull();
    expect(telefonoDeSimat('')).toBeNull();
  });

  it('la etnia: categoría general y el detalle de SIMAT aparte', () => {
    expect(etniaDeSimat('NO APLICA')).toEqual({ grupo: 'NINGUNO', detalle: null, informada: false });
    expect(etniaDeSimat('NEGRITUDES')).toMatchObject({ grupo: 'AFRODESCENDIENTE', detalle: 'NEGRITUDES' });
    expect(etniaDeSimat('AFRODESCENDIENTE').grupo).toBe('AFRODESCENDIENTE');
    expect(etniaDeSimat('PALANQUERO').grupo).toBe('PALENQUERO');
    expect(etniaDeSimat('RAIZAL').grupo).toBe('RAIZAL');
    expect(etniaDeSimat('PAEZ (AUTODENOMINACION NASA)')).toMatchObject({ grupo: 'INDIGENA', detalle: 'PAEZ (AUTODENOMINACION NASA)' });
  });

  it('la discapacidad se acerca a la condición de M16; sordoceguera no se confunde con ceguera', () => {
    expect(discapacidadDeSimat('NO APLICA')).toBeNull();
    expect(discapacidadDeSimat('DISCAPACIDAD INTELECTUAL')?.condicion).toBe('INTELECTUAL');
    expect(discapacidadDeSimat('TRASTORNO DEL ESPECTRO AUTISTA')?.condicion).toBe('TEA');
    expect(discapacidadDeSimat('SORDOCEGUERA')?.condicion).toBe('SORDOCEGUERA');
    expect(discapacidadDeSimat('DISCAPACIDAD VISUAL CEGUERA')?.condicion).toBe('VISUAL_CEGUERA');
    expect(discapacidadDeSimat('DISCAPACIDAD VISUAL BAJA VISIÓN IRREVERSIBLE')?.condicion).toBe('VISUAL_BAJA_VISION');
    expect(discapacidadDeSimat('DISCAPACIDAD AUDITIVA - USUARIO DE LENGUA DE SEÑAS COLOMBIANA')?.condicion).toBe('AUDITIVA_SORDERA');
    expect(discapacidadDeSimat('DISCAPACIDAD AUDITIVA USUARIO DEL CASTELLANO')?.condicion).toBe('AUDITIVA_HIPOACUSIA');
    expect(discapacidadDeSimat('ALGO NUEVO')?.condicion).toBeNull();
  });

  it('jornadas y grados', () => {
    expect(jornadaDeSimat('MAÑANA')).toBe('MANANA');
    expect(jornadaDeSimat('ÚNICA')).toBe('UNICA');
    expect(jornadaDeSimat('FIN DE SEMANA')).toBe('SABATINA');
    expect(jornadaDeSimat('COMPLETA')).toBeNull();
    for (const g of [-2, -1, 0, 1, 11]) expect(gradoEsSoportado(g)).toBe(true);
    for (const g of [12, 21, 24, 26, 99]) expect(gradoEsSoportado(g)).toBe(false);
  });
});

const CRUDA = {
  ano: 2026,
  estado: 'MATRICULADO',
  dane: 176892000108,
  dane_sede: 276892000242,
  sede: 'MANUEL MARIA SANCHEZ',
  jornada: 'ÚNICA',
  grado: 6,
  grupo: 601,
  fecha_inicio: 46028.487175925926,
  nui: 'SAMABO1778704895',
  per_id: 80418835,
  documento: 1116379795,
  tipo_documento: 'TI:TARJETA DE IDENTIDAD',
  apellido1: 'abonia',
  apellido2: 'Palacios ',
  nombre1: 'Samuel',
  genero: 'MASCULINO',
  fecha_nacimiento: 42405,
  barrio: 'LA NUEVA ESTANCIA',
  eps: 'SOS SERVICIO OCCIDENTAL DE SALUD',
  tipo_sangre: 'O +',
  estrato: 'ESTRATO 1',
  sisben: 'a4',
  etnia: 'NO APLICA',
  telefono: '3127984925/3001112233',
  correo: 'familia@correo.com',
};

describe('SIMAT: una fila normalizada', () => {
  it('limpia todo y deja la fila lista, sin errores', () => {
    const { fila, errores, avisos } = normalizarFila(CRUDA, 7);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
    expect(fila).toMatchObject({
      numero: 7,
      accion: 'MATRICULAR',
      dane: '176892000108',
      dane_sede: '276892000242',
      jornada: 'UNICA',
      grado: 6,
      grupo: '601',
      documento: '1116379795',
      tipo_documento: 'TI',
      primer_apellido: 'ABONIA',
      segundo_apellido: 'PALACIOS',
      primer_nombre: 'SAMUEL',
      genero: 'M',
      fecha_nacimiento: '2016-02-05',
      per_id: '80418835',
      rh: 'O+',
      estrato: 1,
      sisben: 'A4',
      telefono: '3127984925',
      correo: 'familia@correo.com',
      discapacidad: null,
      talento: false,
    });
  });

  it('reporta errores de datos (documento, fecha, nombres) y avisos de lo que descarta', () => {
    const { errores, avisos, fila } = normalizarFila({ ...CRUDA, documento: '', fecha_nacimiento: 'x', nombre1: '', estrato: 'ESTRATO 0', sisben: 'Z9', tipo_sangre: 'Q', correo: 'no-es-correo', telefono: 'sin' }, 3);
    expect(errores).toHaveLength(3);
    expect(avisos.some((a) => /Estrato 0/.test(a))).toBe(true);
    expect(avisos.some((a) => /SISBEN/.test(a))).toBe(true);
    expect(avisos.some((a) => /sangre/.test(a))).toBe(true);
    expect(avisos.some((a) => /correo/.test(a))).toBe(true);
    expect(avisos.some((a) => /teléfono/i.test(a))).toBe(true);
    expect(fila.sisben).toBeNull();
    expect(fila.estrato).toBeNull();
  });

  it('una fecha de nacimiento futura es error', () => {
    expect(normalizarFila({ ...CRUDA, fecha_nacimiento: '2999-01-01' }, 1).errores.join(' ')).toMatch(/futura/);
  });

  it('el estado decide la acción: solo «MATRICULADO» matricula', () => {
    expect(normalizarFila({ ...CRUDA, estado: 'RETIRADO' }, 1).fila.accion).toBe('RETIRADO');
    for (const e of ['SIN CONTINUIDAD', 'NUEVO', 'ASIGNADO POR CONTINUIDAD', 'GRADUADO']) expect(normalizarFila({ ...CRUDA, estado: e }, 1).fila.accion).toBe('OMITIR');
  });
});

describe('SIMAT: sincronizar a alguien que ya existe', () => {
  const existente = {
    telefono: '3000000000',
    nombre: 'Samuel',
    apellido: 'Abonia Palacios',
    fecha_nacimiento: new Date('2016-02-05T00:00:00Z'),
    genero: 'M',
    barrio_vereda: 'La Estancia',
    eps: 'Sura',
    rh: 'A+',
    estrato: 2,
    sisben_grupo: 'B1',
    grupo_etnico: 'NINGUNO',
    tiene_discapacidad: false,
    tiene_talento_excepcional: false,
    autorizacion_otorgada: true,
  };
  const fila = normalizarFila(CRUDA, 1).fila;

  it('actualiza solo lo que cambió y dice qué campos', () => {
    const c = cambiosDeEstudiante(existente, fila, { autorizacion_salud: true });
    expect(c.usuario.telefono).toBe('3127984925');
    expect(c.perfil).toMatchObject({ barrio_vereda: 'LA NUEVA ESTANCIA', eps: 'SOS SERVICIO OCCIDENTAL DE SALUD', rh: 'O+', estrato: 1, sisben_grupo: 'A4', simat_per_id: '80418835', correo_contacto: 'familia@correo.com' });
    expect(c.campos).toEqual(expect.arrayContaining(['Teléfono', 'Barrio', 'EPS', 'Tipo de sangre', 'Estrato', 'Grupo SISBEN']));
    expect(c.identidad).toEqual([]);
  });

  it('si no hay nada nuevo no cambia nada (no se guarda, no se mueve updatedAt)', () => {
    const igual = {
      ...existente,
      telefono: '3127984925',
      barrio_vereda: 'la nueva estancia',
      eps: 'SOS SERVICIO OCCIDENTAL DE SALUD',
      rh: 'O+',
      estrato: 1,
      sisben_grupo: 'A4',
      correo_contacto: 'familia@correo.com',
      simat_per_id: '80418835',
      simat_nui: 'SAMABO1778704895',
    };
    const c = cambiosDeEstudiante(igual, fila, { autorizacion_salud: true });
    expect(c.campos).toEqual([]);
    expect(c.perfil).toEqual({});
    expect(c.usuario).toEqual({});
  });

  it('un valor vacío de SIMAT nunca borra lo que Klassy ya tiene', () => {
    const vacia = { ...fila, telefono: null, barrio: null, eps: null, rh: null, estrato: null, sisben: null, correo: null };
    const c = cambiosDeEstudiante(existente, vacia, { autorizacion_salud: true });
    expect(c.campos).toEqual(expect.not.arrayContaining(['Teléfono', 'Barrio', 'EPS', 'Estrato', 'Grupo SISBEN']));
    expect(c.perfil).not.toHaveProperty('estrato');
  });

  it('«sin etnia» de SIMAT no pisa una etnia que Klassy ya tenía', () => {
    const c = cambiosDeEstudiante({ ...existente, grupo_etnico: 'INDIGENA' }, fila, { autorizacion_salud: false });
    expect(c.perfil).not.toHaveProperty('grupo_etnico');
  });

  it('sin la autorización declarada no toca EPS ni tipo de sangre y lo avisa', () => {
    const c = cambiosDeEstudiante(existente, fila, { autorizacion_salud: false });
    expect(c.perfil).not.toHaveProperty('eps');
    expect(c.perfil).not.toHaveProperty('rh');
    expect(c.salud_omitida).toBe(true);
    expect(c.perfil.sisben_grupo).toBe('A4');
  });

  it('pide registrar la autorización cuando se escribe salud y el perfil no la tenía', () => {
    const c = cambiosDeEstudiante({ ...existente, autorizacion_otorgada: false }, fila, { autorizacion_salud: true });
    expect(c.requiere_autorizacion).toBe(true);
  });

  it('la identidad no se sobrescribe: la diferencia se informa', () => {
    const c = cambiosDeEstudiante({ ...existente, nombre: 'Samuelito', apellido: 'Otro', fecha_nacimiento: new Date('2015-01-01T00:00:00Z'), genero: 'F' }, fila, { autorizacion_salud: true });
    expect(c.identidad).toEqual(['nombres', 'apellidos', 'fecha de nacimiento', 'género']);
    expect(c.perfil).not.toHaveProperty('primer_nombre');
    expect(c.perfil).not.toHaveProperty('fecha_nacimiento');
  });

  it('una discapacidad en SIMAT marca la hoja de vida, pero nunca la quita', () => {
    const conDiscapacidad = { ...fila, discapacidad: discapacidadDeSimat('DISCAPACIDAD INTELECTUAL') };
    expect(cambiosDeEstudiante(existente, conDiscapacidad, { autorizacion_salud: false }).perfil.tiene_discapacidad).toBe(true);
    expect(cambiosDeEstudiante({ ...existente, tiene_discapacidad: true }, fila, { autorizacion_salud: false }).perfil).not.toHaveProperty('tiene_discapacidad');
  });
});

describe('SIMAT: orden de los folios y llaves', () => {
  const base = (parte: Partial<FilaSimat>) => ({ fecha_matricula: null, grado: 6, grupo: '601', primer_apellido: 'A', primer_nombre: 'B', documento: '1', ...parte });

  it('primero la fecha en que SIMAT registró la matrícula; a igual fecha, grado, grupo y apellido', () => {
    const filas = [
      base({ documento: 'sin fecha' }),
      base({ documento: 'tarde', fecha_matricula: '2026-02-01T10:00:00.000Z' }),
      base({ documento: 'pronto-grado7', fecha_matricula: '2025-12-16T10:00:00.000Z', grado: 7, grupo: '701' }),
      base({ documento: 'pronto-grado6-z', fecha_matricula: '2025-12-16T10:00:00.000Z', primer_apellido: 'Z' }),
      base({ documento: 'pronto-grado6-a', fecha_matricula: '2025-12-16T10:00:00.000Z', primer_apellido: 'A' }),
    ];
    expect(ordenarParaFolio(filas).map((f) => f.documento)).toEqual(['pronto-grado6-a', 'pronto-grado6-z', 'pronto-grado7', 'tarde', 'sin fecha']);
  });

  it('es determinista: el mismo archivo siempre da el mismo orden', () => {
    const filas = Array.from({ length: 20 }, (_, i) => base({ documento: String(i), fecha_matricula: `2026-01-${String((i % 5) + 1).padStart(2, '0')}T10:00:00.000Z` }));
    const una = ordenarParaFolio(filas).map((f) => f.documento);
    const otra = ordenarParaFolio([...filas].reverse()).map((f) => f.documento);
    expect(otra).toEqual(una);
  });

  it('la sede y la jornada son parte de la llave del grupo (dos sedes repiten 601)', () => {
    const a = llaveDeGrupoSimat({ dane_sede: '176892000108', jornada: 'UNICA', grado: 6, grupo: '601' });
    const b = llaveDeGrupoSimat({ dane_sede: '276892000242', jornada: 'UNICA', grado: 6, grupo: '601' });
    expect(a).not.toBe(b);
  });

  it('detecta el separador de un csv o txt de SIMAT', () => {
    expect(detectarDelimitadorSimat('ANO,ESTADO,DANE\n2026,x,y')).toBe(',');
    expect(detectarDelimitadorSimat('ANO;ESTADO;DANE\n2026;x;y')).toBe(';');
    expect(detectarDelimitadorSimat('ANO|ESTADO|DANE\n2026|x|y')).toBe('|');
    expect(detectarDelimitadorSimat('ANO\tESTADO\tDANE\n2026\tx\ty')).toBe('\t');
    expect(detectarDelimitadorSimat('"A,B";C;D')).toBe(';');
  });
});
