import { describe, expect, it } from 'vitest';
import { COLUMNAS_ACUDIENTES, ENCABEZADOS_PLANTILLA_ACUDIENTES, TELEFONO_SIN_DATO } from '../src/constants/importacionAcudientes';
import { camposACompletar, mapearColumnasAcudientes, nombreCoincide, normalizarFilaAcudiente, parentescoDeAcudiente, siNoDeCelda } from '../src/utils/importacionAcudientes';
import { normalizarEncabezadoSimat } from '../src/utils/importacionSimat';
// La guía vive en el frontend (es lo que lee el usuario) y no importa React en tiempo de ejecución, por eso se puede leer desde aquí.
import { COLUMNAS_ACUDIENTES_GUIA } from '../../frontend/src/lib/guiaAcudientes';

// Todo con casos sintéticos: un archivo real trae documentos y teléfonos de menores y de sus familias.

const completa = {
  tipo_doc_estudiante: 'TI',
  doc_estudiante: 1109672200,
  nombre_estudiante: 'Santiago Abad',
  tipo_documento: 'CC',
  documento: 31852960,
  apellido1: 'Pérez',
  apellido2: 'Gómez',
  nombre1: 'Kelly',
  nombre2: 'Andrea',
  parentesco: 'MADRE',
  telefono: '3001112233',
  correo: 'Kelly@Correo.com',
};

describe('encabezados', () => {
  it('reconoce los nombres de la captura sin importar mayúsculas, guiones bajos ni tildes', () => {
    const mapa = mapearColumnasAcudientes(['TIPODOC_EST', 'DOC_EST', 'Tipodoc_Acudiente', 'DOC_ACUDIENTE', 'APELLIDO1', 'nombre1', 'PARENTESCO', 'TEL_CONTACTO']);
    expect(mapa.faltantes).toEqual([]);
    expect(mapa.indices.doc_estudiante).toBe(1);
    expect(mapa.indices.telefono2).toBe(7);
  });

  it('dice qué obligatorias faltan', () => {
    const mapa = mapearColumnasAcudientes(['DOC_ACUDIENTE', 'NOMBRE1']);
    expect(mapa.faltantes).toEqual(expect.arrayContaining(['doc_estudiante', 'apellido1', 'parentesco']));
  });

  it('los encabezados de la plantilla se leen todos con la misma lógica del importador', () => {
    const mapa = mapearColumnasAcudientes([...ENCABEZADOS_PLANTILLA_ACUDIENTES]);
    expect(mapa.faltantes).toEqual([]);
    const sinColumna = (Object.keys(COLUMNAS_ACUDIENTES) as Array<keyof typeof COLUMNAS_ACUDIENTES>).filter((c) => mapa.indices[c] === undefined);
    // Lo único que la plantilla no trae es el nivel educativo, que no se guarda.
    expect(sinColumna).toEqual(['nivel_educativo']);
  });
});

describe('parentesco', () => {
  it('los que llevan (A) los decide el género', () => {
    expect(parentescoDeAcudiente('ABUELO(A)', 'F').parentesco).toBe('ABUELA');
    expect(parentescoDeAcudiente('ABUELO(A)', 'M').parentesco).toBe('ABUELO');
    expect(parentescoDeAcudiente('TIO(A)', 'F').parentesco).toBe('TIA');
    expect(parentescoDeAcudiente('HERMANO(A)', 'M').parentesco).toBe('HERMANO');
  });

  it('sin género queda OTRO y avisa; nunca adivina', () => {
    const r = parentescoDeAcudiente('ABUELO(A)', null);
    expect(r.parentesco).toBe('OTRO');
    expect(r.aviso).toMatch(/OTRO/);
  });

  it('acepta los parentescos fijos y el tutor legal escrito de varias formas', () => {
    expect(parentescoDeAcudiente('madre', null).parentesco).toBe('MADRE');
    expect(parentescoDeAcudiente('TUTOR LEGAL', null).parentesco).toBe('TUTOR_LEGAL');
    expect(parentescoDeAcudiente('Tutor_Legal', null).parentesco).toBe('TUTOR_LEGAL');
  });

  it('vacío o desconocido es error, no se descarta en silencio', () => {
    expect(parentescoDeAcudiente('', null).error).toBe('PARENTESCO_FALTANTE');
    expect(parentescoDeAcudiente('PRIMO', null).error).toBe('PARENTESCO_INVALIDO');
  });
});

describe('normalizarFilaAcudiente', () => {
  it('une los nombres y apellidos y guarda el documento como texto', () => {
    const { fila, errores } = normalizarFilaAcudiente(completa, 2);
    expect(errores).toEqual([]);
    expect(fila.nombre).toBe('Kelly Andrea');
    expect(fila.apellido).toBe('Pérez Gómez');
    expect(fila.doc_estudiante).toBe('1109672200');
    expect(fila.numero_documento).toBe('31852960');
    expect(fila.parentesco).toBe('MADRE');
    expect(fila.email).toBe('kelly@correo.com');
  });

  it('sin teléfono guarda «Sin teléfono» y lo avisa, sin tumbar la fila', () => {
    const { fila, errores, avisos } = normalizarFilaAcudiente({ ...completa, telefono: '' }, 2);
    expect(errores).toEqual([]);
    expect(fila.telefono_principal).toBe(TELEFONO_SIN_DATO);
    expect(avisos.join(' ')).toMatch(/Sin teléfono/);
  });

  it('un teléfono con formato raro se conserva tal cual con aviso', () => {
    const { fila, avisos } = normalizarFilaAcudiente({ ...completa, telefono: 'casa de la abuela' }, 2);
    expect(fila.telefono_principal).toBe('casa de la abuela');
    expect(avisos.join(' ')).toMatch(/formato/);
  });

  it('agrega el barrio a la dirección una sola vez', () => {
    expect(normalizarFilaAcudiente({ ...completa, direccion: 'Cra 10 # 5', barrio: 'Centro' }, 2).fila.direccion).toBe('Cra 10 # 5, Barrio Centro');
    expect(normalizarFilaAcudiente({ ...completa, direccion: 'Calle 4 Barrio Norte', barrio: 'Norte' }, 2).fila.direccion).toBe('Calle 4 Barrio Norte');
    expect(normalizarFilaAcudiente({ ...completa, direccion: '', barrio: 'Norte' }, 2).fila.direccion).toBe('Barrio Norte');
  });

  it('sin tipo de documento del acudiente asume CC con aviso; uno inventado es error', () => {
    const sin = normalizarFilaAcudiente({ ...completa, tipo_documento: '' }, 2);
    expect(sin.fila.tipo_documento).toBe('CC');
    expect(sin.avisos.join(' ')).toMatch(/CC/);
    expect(normalizarFilaAcudiente({ ...completa, tipo_documento: 'XX' }, 2).errores).toContain('TIPO_DOC_ACUDIENTE_NO_SOPORTADO');
  });

  it('marca los errores que impiden importar la fila', () => {
    const r = normalizarFilaAcudiente({ ...completa, doc_estudiante: '', documento: 'a', nombre1: '', parentesco: '' }, 3);
    expect(r.errores).toEqual(expect.arrayContaining(['DOC_ESTUDIANTE_INVALIDO', 'DOC_ACUDIENTE_INVALIDO', 'DATOS_INCOMPLETOS', 'PARENTESCO_FALTANTE']));
  });

  it('ES_PRINCIPAL y AUTORIZADO_RETIRO: vacío es «el sistema decide»; un valor raro es error', () => {
    expect(normalizarFilaAcudiente(completa, 2).fila.es_principal).toBeNull();
    expect(normalizarFilaAcudiente({ ...completa, es_principal: 'SI', autorizado_retiro: 'NO' }, 2).fila).toMatchObject({ es_principal: true, autorizado_retiro: false });
    expect(normalizarFilaAcudiente({ ...completa, es_principal: 'quizás' }, 2).errores).toContain('VALOR_INVALIDO');
  });
});

describe('siNoDeCelda', () => {
  it('entiende SI/NO tolerante', () => {
    expect(siNoDeCelda('Sí')).toBe(true);
    expect(siNoDeCelda('x')).toBe(true);
    expect(siNoDeCelda('NO')).toBe(false);
    expect(siNoDeCelda('')).toBeNull();
    expect(siNoDeCelda('tal vez')).toBeUndefined();
  });
});

describe('nombreCoincide', () => {
  it('tolera el orden y un apellido de más, pero detecta a otra persona', () => {
    expect(nombreCoincide('Santiago Abad', 'Abad Quintero Santiago')).toBe(true);
    expect(nombreCoincide('ABAD SANTIAGO', 'Abad Santiago')).toBe(true);
    expect(nombreCoincide('Manuela Abadía', 'Abad Quintero Santiago')).toBe(false);
  });

  it('sin nombre en el archivo no hay nada que comparar', () => {
    expect(nombreCoincide('', 'Abad Santiago')).toBe(true);
  });
});

describe('camposACompletar', () => {
  const existente = { nombre: 'Kelly Andrea', apellido: 'Pérez Gómez', tipo_documento: 'CC', telefono_principal: '3001112233', telefono_secundario: null, email: null, ocupacion: 'Docente', direccion: '' };

  it('completa solo lo que está vacío y nunca pisa un dato', () => {
    const { fila } = normalizarFilaAcudiente({ ...completa, telefono: '3119998877', telefono2: '3101112222', direccion: 'Cra 1', ocupacion: 'Abogada' }, 2);
    const { campos } = camposACompletar(existente, fila);
    expect(campos).toEqual(expect.arrayContaining(['teléfono secundario', 'correo', 'dirección']));
    expect(campos).not.toContain('teléfono principal');
    expect(campos).not.toContain('ocupación');
  });

  it('un «Sin teléfono» anterior sí se completa con un teléfono real', () => {
    const { fila } = normalizarFilaAcudiente(completa, 2);
    expect(camposACompletar({ ...existente, telefono_principal: TELEFONO_SIN_DATO }, fila).campos).toContain('teléfono principal');
  });

  it('un nombre o tipo de documento distinto se informa, no se aplica', () => {
    const { fila } = normalizarFilaAcudiente({ ...completa, nombre1: 'Karla', tipo_documento: 'CE' }, 2);
    expect(camposACompletar(existente, fila).identidad).toEqual(['nombre', 'tipo de documento']);
  });
});


describe('la guía de la pantalla dice lo mismo que el servidor', () => {
  const columnas = Object.keys(COLUMNAS_ACUDIENTES) as Array<keyof typeof COLUMNAS_ACUDIENTES>;
  const columnaDeGuia = (nombre: string) => columnas.find((c) => COLUMNAS_ACUDIENTES[c].alias.map(normalizarEncabezadoSimat).includes(normalizarEncabezadoSimat(nombre)));

  it('cada columna que lee el servidor está explicada, con la misma obligatoriedad', () => {
    for (const c of columnas) {
      const entrada = COLUMNAS_ACUDIENTES_GUIA.find((g) => columnaDeGuia(g.nombre) === c);
      expect(entrada, `falta en la guía: ${c}`).toBeDefined();
      expect(entrada!.obligatoria, `obligatoriedad de ${c}`).toBe(COLUMNAS_ACUDIENTES[c].obligatoria);
    }
  });

  it('la guía no inventa columnas que el servidor no lee', () => {
    for (const g of COLUMNAS_ACUDIENTES_GUIA) expect(columnaDeGuia(g.nombre), `la guía trae ${g.nombre}, que el servidor no reconoce`).toBeDefined();
  });

  it('los encabezados de la plantilla son los mismos de la guía (salvo el que no se guarda)', () => {
    const guia = COLUMNAS_ACUDIENTES_GUIA.map((g) => g.nombre).filter((n) => n !== 'NIVEL_EDUCATIVO').sort();
    expect([...ENCABEZADOS_PLANTILLA_ACUDIENTES].sort()).toEqual(guia);
  });
});
