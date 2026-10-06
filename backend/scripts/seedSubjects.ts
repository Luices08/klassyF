/**
 * Semillero de Asignaturas de Klassy:
 * Carga las 15 asignaturas complementarias asociadas a las 9 áreas oficiales
 * de la institución (Ley 115 de 1994 y especificación M06).
 *
 * Es una operación idempotente (usa findOneAndUpdate con upsert):
 * no duplica asignaturas si ya existen.
 *
 * Uso: npx tsx scripts/seedSubjects.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { NivelEducativo, TipoAsignatura } from '../src/constants/enums';
import Area from '../src/dominios/curricular/plan-estudios/area.model';
import Subject from '../src/dominios/curricular/plan-estudios/subject.model';

interface AsignaturaSeed {
  areaCodigo: string;
  nombre: string;
  abreviatura: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
  descripcion: string;
}

const ASIGNATURAS_CATALOGO: AsignaturaSeed[] = [
  // --- Área: Matemáticas (MAT-BAS) ---
  {
    areaCodigo: 'MAT-BAS',
    nombre: 'Matemáticas',
    abreviatura: 'MAT',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Pensamiento numérico, variacional, algebraico y resolución de problemas.',
  },
  {
    areaCodigo: 'MAT-BAS',
    nombre: 'Geometría y Estadística',
    abreviatura: 'GEO',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA'],
    descripcion: 'Pensamiento espacial, métrico, medidas y análisis estadístico.',
  },
  {
    areaCodigo: 'MAT-BAS',
    nombre: 'Cálculo y Trigonometría',
    abreviatura: 'CALC',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['MEDIA'],
    descripcion: 'Funciones, límites, derivadas, integrales y trigonometría analítica.',
  },

  // --- Área: Educación artística (ED-ART) ---
  {
    areaCodigo: 'ED-ART',
    nombre: 'Artes Plásticas y Visuales',
    abreviatura: 'ART',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Expresión gráfica, dibujo, pintura, modelado e historia del arte.',
  },
  {
    areaCodigo: 'ED-ART',
    nombre: 'Música',
    abreviatura: 'MUS',
    tipo: 'OPTATIVA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Apreciación auditiva, ritmo, solfeo y expresión vocal e instrumental.',
  },
  {
    areaCodigo: 'ED-ART',
    nombre: 'Danza y Expresión Corporal',
    abreviatura: 'DANZ',
    tipo: 'OPTATIVA',
    niveles_educativos: ['SECUNDARIA'],
    descripcion: 'Expresión escénica, movimiento rítmico y folclor cultural colombiano.',
  },

  // --- Área: Educación física, recreación y deportes (EF-REC) ---
  {
    areaCodigo: 'EF-REC',
    nombre: 'Educación Física',
    abreviatura: 'EFI',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Desarrollo motriz, hábitos de vida saludable, acondicionamiento y deportes.',
  },

  // --- Área: Educación ética y en valores humanos (ET-VAL) ---
  {
    areaCodigo: 'ET-VAL',
    nombre: 'Ética y Valores Humanos',
    abreviatura: 'ETI',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Principios morales, empatía, resolución de conflictos y formación ciudadana.',
  },
  {
    areaCodigo: 'ET-VAL',
    nombre: 'Cátedra de la Paz',
    abreviatura: 'PAZ',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Ley 1732: cultura de paz, memoria histórica y derechos humanos.',
  },

  // --- Área: Educación religiosa (ED-REL) ---
  {
    areaCodigo: 'ED-REL',
    nombre: 'Educación Religiosa',
    abreviatura: 'REL',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Reflexión espiritual, trascendencia humana y diversidad de cultos.',
  },

  // --- Área: Ciencias sociales, historia, geografía... (CS-HGD) ---
  {
    areaCodigo: 'CS-HGD',
    nombre: 'Ciencias Sociales',
    abreviatura: 'CSOC',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA'],
    descripcion: 'Entorno geográfico, sociocultural, historia básica y vida comunitaria.',
  },
  {
    areaCodigo: 'CS-HGD',
    nombre: 'Constitución y Democracia',
    abreviatura: 'DEM',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['SECUNDARIA', 'MEDIA'],
    descripcion: 'Participación ciudadana, derechos constitucionales y estructura del Estado.',
  },
  {
    areaCodigo: 'CS-HGD',
    nombre: 'Ciencias Económicas y Políticas',
    abreviatura: 'ECON',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['MEDIA'],
    descripcion: 'Fundamentos de economía, mercado, Estado y políticas públicas.',
  },

  // --- Área: Tecnología e informática (TEC-INF) ---
  {
    areaCodigo: 'TEC-INF',
    nombre: 'Informática',
    abreviatura: 'INF',
    tipo: 'OBLIGATORIA',
    niveles_educativos: ['PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    descripcion: 'Alfabetización digital, suites ofimáticas, internet y ciberseguridad.',
  },
  {
    areaCodigo: 'TEC-INF',
    nombre: 'Programación y Robótica',
    abreviatura: 'ROB',
    tipo: 'OPTATIVA',
    niveles_educativos: ['SECUNDARIA', 'MEDIA'],
    descripcion: 'Pensamiento computacional, lógica algorítmica y robótica educativa.',
  },
];

async function seedSubjects(): Promise<void> {
  const areas = await Area.find();
  if (areas.length === 0) {
    throw new Error('No se encontraron áreas en la base de datos. Se requiere que las áreas existan.');
  }

  const areaMap = new Map<string, mongoose.Types.ObjectId>();
  for (const a of areas) {
    areaMap.set(a.codigo, a._id);
  }

  console.log(`[seed:subjects] Buscando áreas... Encontradas ${areas.length} áreas registradas.`);

  let creadas = 0;
  let omitidas = 0;

  for (const item of ASIGNATURAS_CATALOGO) {
    const areaId = areaMap.get(item.areaCodigo);
    if (!areaId) {
      console.warn(`[seed:subjects] Advertencia: Área con código "${item.areaCodigo}" no encontrada. Se omite.`);
      continue;
    }

    // Idempotente de verdad: si la asignatura ya existe, no se toca. Reemplazar sus campos en
    // cada corrida pisaria ediciones que la institucion ya le hizo desde el Catalogo Academico
    // (reactivarla, cambiarle el tipo o los niveles educativos).
    const yaExiste = await Subject.exists({ area_id: areaId, nombre: item.nombre });
    if (yaExiste) {
      omitidas++;
      console.log(` = Ya existe, se omite: ${item.nombre} (${item.abreviatura}) -> Área [${item.areaCodigo}]`);
      continue;
    }

    await Subject.create({
      area_id: areaId,
      nombre: item.nombre,
      abreviatura: item.abreviatura,
      tipo: item.tipo,
      niveles_educativos: item.niveles_educativos,
      descripcion: item.descripcion,
      estado: 'activo',
    });
    creadas++;
    console.log(` + Creada: ${item.nombre} (${item.abreviatura}) -> Área [${item.areaCodigo}]`);
  }

  console.log(`\n[seed:subjects] Proceso completado: ${creadas} creadas, ${omitidas} ya existían (sin cambios).`);
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[seed:subjects] Conectado a MongoDB.');

  await seedSubjects();

  await mongoose.disconnect();
  console.log('[seed:subjects] Desconectado de MongoDB.');
}

run().catch((err) => {
  console.error('[seed:subjects] Error:', err);
  process.exit(1);
});
