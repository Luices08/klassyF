/**
 * Semillero del Banco de Referentes Curriculares Oficiales (MEN) — M07.
 * Carga DBA (Derechos Basicos de Aprendizaje), EBC (Estandares Basicos de
 * Competencias) y Lineamientos Curriculares desde los archivos JSON de
 * scripts/data/, transcritos de los documentos oficiales del MEN.
 *
 * El area (`Area`) es catalogo de M06, no de M07: este seed NUNCA crea una
 * area nueva (violaria la regla de oro de datos de CLAUDE.md — la
 * informacion se crea una sola vez y se consume por llave foranea). En vez
 * de eso, resuelve cada una de las 4 areas troncales buscando, dentro de las
 * `Subject` que la institucion ya creo en su Plan de Estudios (M06), una
 * cuyo nombre calce con esa area (ej. la asignatura "Lengua Castellana") y
 * usa el `area_id` de esa asignatura — sea cual sea el area a la que la
 * institucion la haya asignado (ej. "Humanidades..."). Si la institucion
 * todavia no tiene esa asignatura creada, esa parte del banco simplemente no
 * se siembra (se avisa por consola) — no se inventa una area para forzarlo.
 *
 * La relacion EBC -> DBA (`dba_relacionados`) no es un cruce que el MEN
 * publique: se calcula por area + organizador (normalizado) + grado dentro
 * del grupo_grados del EBC. Es una construccion razonable, no una copia de
 * un documento oficial.
 *
 * Idempotente de verdad: un referente que ya existe no se toca (mismo
 * criterio que seedSubjects.ts en M06) — volver a correr el seed no reactiva
 * uno que un coordinador marco Historico ni pisa una edicion manual.
 * Uso: npm run seed:referentes
 */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { grupoGradosDeNumero } from '../src/constants/enums';
import Grade from '../src/dominios/institucional/estructura/grade.model';
import Subject from '../src/models/subject.model';
import { Dba, Ebc, Lineamiento } from '../src/models/referenteCurricular.model';

import dbaCienciasNaturales from './data/dbaCienciasNaturales.json';
import dbaCienciasSociales from './data/dbaCienciasSociales.json';
import dbaLenguaje from './data/dbaLenguaje.json';
import dbaMatematicas from './data/dbaMatematicas.json';
import ebcData from './data/ebc.json';
import lineamientosData from './data/lineamientos.json';

interface DbaSeedItem {
  areaCodigo: string;
  gradoNumero: number; // 0 = Transicion, 1..11
  numero_dba: number;
  organizador: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  ejemplo?: string;
  etiquetas: string[];
}

interface EbcSeedItem {
  areaCodigo: string;
  grupo_grados: '1-3' | '4-5' | '6-7' | '8-9' | '10-11';
  organizador: string;
  competencia: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  etiquetas: string[];
}

interface LineamientoSeedItem {
  areaCodigo: string | null; // null = marco general / transversal
  titulo: string;
  contenido: string;
  orden: number;
  etiquetas: string[];
}

// areaCodigo interno del seed -> patrón para ubicar la asignatura real de la
// institución (M06) cuya area_id se va a reusar. No es un código de Area.
const ASIGNATURA_POR_AREA: Record<string, RegExp> = {
  'MAT-BAS': /matem[aá]tica/i,
  'LEN-CAS': /lengua\s*castellana/i,
  'CNAT-BAS': /ciencias\s*naturales/i,
  'CS-HGD': /ciencias\s*sociales/i,
};

const DBA_DATA: DbaSeedItem[] = [
  ...(dbaMatematicas as DbaSeedItem[]),
  ...(dbaLenguaje as DbaSeedItem[]),
  ...(dbaCienciasNaturales as DbaSeedItem[]),
  ...(dbaCienciasSociales as DbaSeedItem[]),
];

const EBC_DATA: EbcSeedItem[] = ebcData as EbcSeedItem[];
const LINEAMIENTOS_DATA: LineamientoSeedItem[] = lineamientosData as LineamientoSeedItem[];

const normaliza = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Resuelve cada una de las 4 areas troncales a partir de las asignaturas que
 * la institucion ya creo en su Plan de Estudios (M06) — nunca crea una Area
 * nueva. Si dos asignaturas calzan con el mismo patron (ej. una institucion
 * con "Ciencias Sociales" y "Ciencias Sociales y Económicas"), toma la
 * primera; si ninguna calza, esa area queda sin sembrar (se avisa).
 */
async function resolverAreas(): Promise<Map<string, Types.ObjectId>> {
  const areaMap = new Map<string, Types.ObjectId>();
  // Solo asignaturas vigentes, en un orden estable (nombre), para que la coincidencia no dependa
  // del orden de insercion en Mongo ni pueda recaer en una asignatura que la institucion ya inactivo.
  const asignaturas = await Subject.find({ estado: 'activo' }).sort({ nombre: 1 });

  for (const [areaCodigo, patron] of Object.entries(ASIGNATURA_POR_AREA)) {
    const asignatura = asignaturas.find((s) => patron.test(s.nombre));
    if (asignatura) {
      areaMap.set(areaCodigo, asignatura.area_id);
    } else {
      console.warn(
        `[seed:referentes] No se encontró en el Plan de Estudios (M06) una asignatura que calce con "${areaCodigo}" ` +
          '(ej. "Lengua Castellana"). Esa parte del banco no se siembra todavía — créala primero en M06.'
      );
    }
  }
  return areaMap;
}

async function seedDba(areaMap: Map<string, Types.ObjectId>, gradeMap: Map<number, Types.ObjectId>): Promise<number> {
  let creados = 0;
  for (const item of DBA_DATA) {
    const areaId = areaMap.get(item.areaCodigo);
    const gradeId = gradeMap.get(item.gradoNumero);
    if (!areaId) {
      console.warn(`[seed:referentes] DBA: área ${item.areaCodigo} no encontrada. Saltando.`);
      continue;
    }
    if (!gradeId) {
      console.warn(`[seed:referentes] DBA: grado número ${item.gradoNumero} no encontrado. Saltando.`);
      continue;
    }

    const yaExiste = await Dba.exists({ area_id: areaId, grade_id: gradeId, numero_dba: item.numero_dba });
    if (yaExiste) continue;

    await Dba.create({
      area_id: areaId,
      grade_id: gradeId,
      numero_dba: item.numero_dba,
      organizador: item.organizador,
      enunciado: item.enunciado,
      evidencias_aprendizaje: item.evidencias_aprendizaje,
      ejemplo: item.ejemplo || '',
      etiquetas: item.etiquetas,
      version: 'V2',
      fuente: 'MEN - Derechos Básicos de Aprendizaje',
      estado: 'activo',
    });
    creados++;
  }
  return creados;
}

async function seedEbc(areaMap: Map<string, Types.ObjectId>): Promise<number> {
  let creados = 0;
  for (const item of EBC_DATA) {
    const areaId = areaMap.get(item.areaCodigo);
    if (!areaId) {
      console.warn(`[seed:referentes] EBC: área ${item.areaCodigo} no encontrada. Saltando.`);
      continue;
    }

    const yaExiste = await Ebc.exists({ area_id: areaId, grupo_grados: item.grupo_grados, enunciado: item.enunciado });
    if (yaExiste) continue;

    await Ebc.create({
      area_id: areaId,
      grupo_grados: item.grupo_grados,
      organizador: item.organizador,
      competencia: item.competencia,
      enunciado: item.enunciado,
      evidencias_aprendizaje: item.evidencias_aprendizaje,
      etiquetas: item.etiquetas,
      version: 'V1',
      fuente: 'MEN - Estándares Básicos de Competencias',
      estado: 'activo',
    });
    creados++;
  }
  return creados;
}

/**
 * Vincula cada EBC con los DBA de la misma area cuyo grado cae dentro de su
 * grupo_grados y cuyo organizador coincide (normalizado, exacto o por
 * contencion) — heuristica, no un cruce oficial del MEN (ver cabecera).
 */
async function vincularEbcConDba(): Promise<number> {
  const [todosEbc, todosDba] = await Promise.all([
    Ebc.find(),
    Dba.find({ estado: 'activo' }).populate<{ grade_id: { numero: number } }>('grade_id', 'numero'),
  ]);

  let vinculados = 0;
  for (const ebc of todosEbc) {
    const organizadorEbc = normaliza(ebc.organizador);
    const relacionados = todosDba.filter((dba) => {
      if (String(dba.area_id) !== String(ebc.area_id)) return false;
      const grado = dba.grade_id as unknown as { numero: number } | null;
      if (!grado || grupoGradosDeNumero(grado.numero) !== ebc.grupo_grados) return false;
      const organizadorDba = normaliza(dba.organizador);
      return (
        organizadorDba === organizadorEbc ||
        organizadorDba.includes(organizadorEbc) ||
        organizadorEbc.includes(organizadorDba)
      );
    });

    if (relacionados.length > 0) {
      ebc.dba_relacionados = relacionados.map((d) => d._id);
      await ebc.save();
      vinculados++;
    }
  }
  return vinculados;
}

async function seedLineamientos(areaMap: Map<string, Types.ObjectId>): Promise<number> {
  let creados = 0;
  for (const item of LINEAMIENTOS_DATA) {
    const areaId = item.areaCodigo ? areaMap.get(item.areaCodigo) : null;
    if (item.areaCodigo && !areaId) {
      console.warn(`[seed:referentes] Lineamiento: área ${item.areaCodigo} no encontrada. Saltando.`);
      continue;
    }

    const yaExiste = await Lineamiento.exists({ titulo: item.titulo });
    if (yaExiste) continue;

    await Lineamiento.create({
      area_id: areaId ?? null,
      titulo: item.titulo,
      contenido: item.contenido,
      orden: item.orden,
      etiquetas: item.etiquetas,
      version: 'V1',
      fuente: 'MEN - Lineamientos Curriculares',
      estado: 'activo',
    });
    creados++;
  }
  return creados;
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[seed:referentes] Conectado a MongoDB.');

  const areaMap = await resolverAreas();
  console.log(`[seed:referentes] Áreas resueltas desde el Plan de Estudios (M06): ${areaMap.size}/4`);

  const grades = await Grade.find();
  const gradeMap = new Map<number, Types.ObjectId>(grades.map((g) => [g.numero, g._id]));
  console.log(`[seed:referentes] Grados detectados en BD: ${gradeMap.size}`);

  const dbaCreados = await seedDba(areaMap, gradeMap);
  console.log(`[seed:referentes] DBA creados: ${dbaCreados} (los ya existentes no se tocaron)`);

  const ebcCreados = await seedEbc(areaMap);
  console.log(`[seed:referentes] EBC creados: ${ebcCreados} (los ya existentes no se tocaron)`);

  const vinculados = await vincularEbcConDba();
  console.log(`[seed:referentes] EBC con al menos un DBA vinculado: ${vinculados}`);

  const lineamientosCreados = await seedLineamientos(areaMap);
  console.log(`[seed:referentes] Lineamientos creados: ${lineamientosCreados} (los ya existentes no se tocaron)`);

  await mongoose.disconnect();
  console.log('[seed:referentes] Proceso completado exitosamente.');
}

run().catch((err) => {
  console.error('[seed:referentes] Error en ejecución:', err);
  process.exit(1);
});
