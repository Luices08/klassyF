import { describe, expect, it } from 'vitest';
import { COLUMNAS_SIMAT, COLUMNAS_SIMAT_IGNORADAS_A_PROPOSITO, ColumnaSimat } from '../src/constants/importacionSimat';
import {
  estratoDeSimat,
  generoDeSimat,
  gradoEsSoportado,
  gradoDeSimat,
  jornadaDeSimat,
  normalizarEncabezadoSimat,
  sangreDeSimat,
  telefonoDeSimat,
  tipoDocumentoDeSimat,
} from '../src/utils/importacionSimat';
// La guía vive en el frontend (es lo que lee el usuario) y no importa React en tiempo de ejecución, por eso se puede leer desde aquí.
import { COLUMNAS_SIMAT_GUIA } from '../../frontend/src/lib/guiaSimat';

/** Encabezados del archivo plano de SIMAT (corte de abril de 2026), en su orden. Solo nombres de columna: ningún dato de personas. */
const ENCABEZADOS_DEL_ARCHIVO_DE_SIMAT = [
  'ANO', 'ETC', 'ESTADO', 'JERARQUIA', 'INSTITUCION', 'DANE', 'CALENDARIO', 'SECTOR', 'SEDE', 'CODIGO_DANE_SEDE', 'CONSECUTIVO', 'ZONA_SEDE', 'JORNADA',
  'GRADO_COD', 'GRUPO', 'RENOMBRE', 'MODELO', 'MOTIVO', 'FECHAINI', 'FECHAFIN', 'NUI', 'ESTRATO', 'SISBEN IV', 'PER_ID', 'DOC', 'TIPODOC', 'APELLIDO1',
  'APELLIDO2', 'NOMBRE1', 'NOMBRE2', 'GENERO', 'FECHA_NACIMIENTO', 'BARRIO', 'EPS', 'TIPO DE SANGRE', 'MATRICULACONTRATADA', 'FUENTE_RECURSOS',
  'INTERNADO', 'NUM_CONTRATO', 'HA_ESTADO_VINCULADO_SRPA', 'ESTA_ACTIVO_SRPA', 'DISCAPACIDAD', 'PAIS_ORIGEN', 'CORREO', 'TELEFONO', 'ETNIA',
  'TRA_ESP_APR_ESCOLAR', 'APOYO_ACADEMICO_ESPECIAL', 'LIST_CAP_EXCEPCIONALES', 'CAMPESINO', 'PAIS_NACIMIENTO', 'PAIS_NACIONALIDAD2', 'CATEGORIA_AULA', 'CONTADOR',
];

const clave = normalizarEncabezadoSimat;
const COLUMNAS = Object.keys(COLUMNAS_SIMAT) as ColumnaSimat[];
const GRUPOS_QUE_SE_LEEN = (g?: string) => !/^(No se leen|Nunca se leen)/.test(g ?? '');

describe('la guía del archivo de SIMAT dice lo mismo que el servidor', () => {
  it('tiene una fila por cada encabezado del archivo de SIMAT y ninguna repetida', () => {
    const nombres = COLUMNAS_SIMAT_GUIA.map((c) => clave(c.nombre));
    expect(new Set(nombres).size).toBe(nombres.length);
    expect([...nombres].sort()).toEqual(ENCABEZADOS_DEL_ARCHIVO_DE_SIMAT.map(clave).sort());
  });

  it('cada columna que el servidor lee aparece en la guía con la misma obligatoriedad', () => {
    for (const columna of COLUMNAS) {
      const alias = COLUMNAS_SIMAT[columna].alias.map(clave);
      const filas = COLUMNAS_SIMAT_GUIA.filter((g) => alias.includes(clave(g.nombre)));
      expect(filas, `La columna «${columna}» debe estar una sola vez en la guía`).toHaveLength(1);
      expect(filas[0]!.obligatoria, `Obligatoriedad de «${columna}»`).toBe(COLUMNAS_SIMAT[columna].obligatoria);
    }
  });

  it('las columnas que la guía marca como «no se leen» no las lee el servidor, y las del SRPA son las reservadas', () => {
    const alias = new Set(COLUMNAS.flatMap((c) => COLUMNAS_SIMAT[c].alias.map(clave)));
    for (const g of COLUMNAS_SIMAT_GUIA.filter((c) => !GRUPOS_QUE_SE_LEEN(c.grupo))) {
      expect(alias.has(clave(g.nombre)), `«${g.nombre}» no debería estar entre las columnas que se leen`).toBe(false);
    }
    const reservadas = COLUMNAS_SIMAT_GUIA.filter((c) => c.grupo?.startsWith('Nunca se leen')).map((c) => clave(c.nombre));
    expect(reservadas.sort()).toEqual(COLUMNAS_SIMAT_IGNORADAS_A_PROPOSITO.map(clave).sort());
  });

  it('toda columna de la guía dice qué hace Klassy con ella y a qué sección pertenece', () => {
    for (const g of COLUMNAS_SIMAT_GUIA) {
      expect(g.uso, g.nombre).toBeTruthy();
      expect(g.grupo, g.nombre).toBeTruthy();
    }
  });

  it('los valores que la guía promete aceptar, el servidor los acepta; los que dice que se omiten, los omite', () => {
    // TIPODOC
    for (const tipo of ['TI', 'RC', 'CC', 'CE', 'PEP', 'PPT', 'NES']) expect(tipoDocumentoDeSimat(`${tipo}:UN TEXTO`).tipo, tipo).toBe(tipo);
    for (const tipo of ['VISA', 'NUIP:NÚMERO UNICO DE IDENTIFICACIÓN PERSONAL', 'NIP:NÚMERO DE IDENTIFICACIÓN PERSONAL']) expect(tipoDocumentoDeSimat(tipo).tipo, tipo).toBeNull();
    // JORNADA
    for (const jornada of ['MAÑANA', 'TARDE', 'ÚNICA', 'NOCTURNA', 'FIN DE SEMANA']) expect(jornadaDeSimat(jornada), jornada).not.toBeNull();
    expect(jornadaDeSimat('FIN DE SEMANA')).toBe('SABATINA');
    expect(jornadaDeSimat('COMPLETA')).toBeNull();
    // GRADO_COD
    for (let g = -2; g <= 11; g += 1) expect(gradoEsSoportado(gradoDeSimat(String(g))!), `grado ${g}`).toBe(true);
    for (const g of [21, 22, 23, 24, 25, 26, 99]) expect(gradoEsSoportado(g), `grado ${g}`).toBe(false);
    // GENERO, ESTRATO, TIPO DE SANGRE, TELEFONO
    expect(generoDeSimat('MASCULINO')).toBe('M');
    expect(generoDeSimat('FEMENINO')).toBe('F');
    expect(generoDeSimat('OTRO')).toBeNull();
    expect(estratoDeSimat('ESTRATO 6').valor).toBe(6);
    expect(estratoDeSimat('ESTRATO 0')).toEqual({ valor: null, cero: true });
    expect(estratoDeSimat('NO APLICA').valor).toBeNull();
    for (const sangre of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'O +']) expect(sangreDeSimat(sangre), sangre).not.toBeNull();
    expect(telefonoDeSimat('3127984925')).toBe('3127984925');
    expect(telefonoDeSimat('573127984925')).toBe('3127984925');
    expect(telefonoDeSimat('3156716162/3217341666')).toBe('3156716162');
    expect(telefonoDeSimat('2345678')).toBe('2345678');
    expect(telefonoDeSimat('12345')).toBeNull();
  });
});
