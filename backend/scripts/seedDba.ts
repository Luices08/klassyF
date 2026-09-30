/**
 * Semillero del Banco de Referentes Curriculares Oficiales (MEN / ICFES) - M07
 * Carga registros estructurados de:
 *  - DBA (Derechos Básicos de Aprendizaje) organizados por Pensamiento / Factor / Entorno / Eje.
 *  - EBC (Estándares Básicos de Competencias) organizados por grupos de grados.
 *
 * Operación 100% idempotente (upsert).
 * Uso: npx tsx scripts/seedDba.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import Area from '../src/models/area.model';
import DBABank from '../src/models/dbaBank.model';
import Grade from '../src/models/grade.model';
import Institution from '../src/models/institution.model';

interface DbaSeedItem {
  areaCodigo: string;
  gradoNumero: number; // 1 a 11
  numero_dba: number;
  organizador: string; // Pensamiento, Factor, Entorno, Eje
  enunciado: string;
  evidencias_aprendizaje: string[];
  ejemplo?: string;
  etiquetas: string[];
}

interface EbcSeedItem {
  areaCodigo: string;
  grupo_grados: string; // "1-3", "4-5", "6-7", "8-9", "10-11"
  organizador: string;
  competencia: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  etiquetas: string[];
}

const AREAS_OFICIALES = [
  {
    codigo: 'MAT-BAS',
    nombre: 'Matemáticas',
    descripcion: 'Pensamiento matemático, resolución de problemas y modelación.',
  },
  {
    codigo: 'LEN-CAS',
    nombre: 'Lengua Castellana',
    descripcion: 'Competencias comunicativas, comprensión, producción textual y literatura.',
  },
  {
    codigo: 'CNAT-BAS',
    nombre: 'Ciencias Naturales y Educación Ambiental',
    descripcion: 'Pensamiento científico, indagación y comprensión de seres vivos y entorno físico.',
  },
  {
    codigo: 'CS-HGD',
    nombre: 'Ciencias Sociales',
    descripcion: 'Comprensión histórica, espacial, política y ciudadana.',
  },
];

const DBA_DATA: DbaSeedItem[] = [
  // ==========================================
  // MATEMÁTICAS (Pensamientos: Numérico, Espacial, Métrico, Aleatorio, Variacional)
  // ==========================================
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 1,
    numero_dba: 1,
    organizador: 'Pensamiento numérico',
    enunciado: 'Identifica los usos de los números (como código, cardinal, medida, ordinal) y las operaciones (suma y resta) en contextos de juego, familiares y económicos.',
    evidencias_aprendizaje: [
      'Construye e interpreta representaciones pictóricas y diagramas para representar relaciones entre cantidades que se suman y restan.',
      'Explica cómo y por qué es posible hacer una suma o una resta en una situación determinada.',
      'Reconoce en sus actuaciones cotidianas posibilidades de uso de los números y las operaciones.',
    ],
    ejemplo: 'En un juego de mesa con dados, el estudiante avanza sumando los puntos obtenidos y explica su posición.',
    etiquetas: ['números', 'conteo', 'suma', 'resta', 'cardinal', 'ordinal'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 1,
    numero_dba: 2,
    organizador: 'Pensamiento espacial',
    enunciado: 'Compara y clasifica objetos bidimensionales y tridimensionales según sus características geométricas.',
    evidencias_aprendizaje: [
      'Identifica formas geométricas en objetos de su entorno (círculos, cuadrados, triángulos, esferas, cubos).',
      'Describe y clasifica figuras de acuerdo con el número de lados y vértices.',
    ],
    etiquetas: ['geometría', 'figuras bidimensionales', 'figuras tridimensionales', 'lados'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 3,
    numero_dba: 1,
    organizador: 'Pensamiento numérico',
    enunciado: 'Interpreta, formula y resuelve problemas aditivos de composición, transformación y comparación en diferentes contextos.',
    evidencias_aprendizaje: [
      'Construye diagramas para representar relaciones entre cantidades en problemas multiplicativos simples.',
      'Usa algoritmos no convencionales y convencionales para calcular sumas y restas con números de hasta cuatro cifras.',
    ],
    etiquetas: ['adición', 'sustracción', 'problemas aditivos', 'cálculo mental'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 4,
    numero_dba: 1,
    organizador: 'Pensamiento numérico',
    enunciado: 'Interpreta las fracciones como parte de un todo, como cociente y como razón en diferentes contextos cotidianos.',
    evidencias_aprendizaje: [
      'Explica con sus palabras qué representa una fracción en situaciones de reparto equitativo.',
      'Construye representaciones gráficas y pictóricas para ilustrar fracciones propias e impropias.',
      'Establece relaciones de equivalencia entre fracciones usuales (ej. 1/2 = 2/4 = 4/8).',
    ],
    ejemplo: 'Repartir 3 manzanas entre 4 niños expresando la porción de cada uno como 3/4.',
    etiquetas: ['fracciones', 'parte-todo', 'cociente', 'razón', 'equivalencia'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 4,
    numero_dba: 2,
    organizador: 'Pensamiento métrico',
    enunciado: 'Elige instrumentos y unidades estandarizadas apropiadas para medir masa, capacidad, longitud, área y volumen.',
    evidencias_aprendizaje: [
      'Estima y calcula el área de superficies planas mediante el conteo de unidades cuadradas.',
      'Compara la capacidad de distintos recipientes usando el litro y el mililitro.',
    ],
    etiquetas: ['medición', 'área', 'volumen', 'capacidad', 'unidades'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 5,
    numero_dba: 1,
    organizador: 'Pensamiento numérico',
    enunciado: 'Interpreta y utiliza los números naturales y racionales en sus representaciones fraccionaria y decimal para formular y resolver problemas.',
    evidencias_aprendizaje: [
      'Compara y ordena números decimales en la recta numérica.',
      'Resuelve problemas que involucran sumas, restas, multiplicaciones y divisiones con números decimales.',
    ],
    etiquetas: ['números decimales', 'fracciones', 'recta numérica', 'operaciones'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 7,
    numero_dba: 1,
    organizador: 'Pensamiento numérico',
    enunciado: 'Comprende y utiliza los números enteros y racionales con sus propiedades y operaciones para resolver situaciones problema en contextos matemáticos y de las ciencias.',
    evidencias_aprendizaje: [
      'Reconoce y utiliza el valor absoluto de un número entero en situaciones de ganancia/pérdida o sobre/bajo el nivel del mar.',
      'Aplica las propiedades de la potenciación y radicación en los racionales.',
    ],
    etiquetas: ['números enteros', 'números racionales', 'potenciación', 'radicación', 'valor absoluto'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 9,
    numero_dba: 1,
    organizador: 'Pensamiento variacional',
    enunciado: 'Utiliza los números reales con sus operaciones y propiedades para resolver problemas de variación en contextos geométricos y de física.',
    evidencias_aprendizaje: [
      'Modela situaciones de variación cuadrática mediante expresiones algebraicas, tablas y gráficas parabólicas.',
      'Resuelve sistemas de ecuaciones lineales 2x2 utilizando métodos analíticos y gráficos.',
    ],
    etiquetas: ['números reales', 'función cuadrática', 'ecuaciones lineales', 'sistemas 2x2'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 10,
    numero_dba: 1,
    organizador: 'Pensamiento espacial',
    enunciado: 'Comprende y utiliza las razones y funciones trigonométricas (seno, coseno, tangente) para resolver problemas de medición indirecta de distancias y ángulos.',
    evidencias_aprendizaje: [
      'Aplica los teoremas del seno y del coseno en la resolución de triángulos oblicuángulos.',
      'Grafica y describe las características fundamentales de las funciones periódicas (amplitud, periodo, fase).',
    ],
    ejemplo: 'Calcular la altura de un edificio conociendo el ángulo de elevación de 35° y la distancia horizontal de 40m a la base.',
    etiquetas: ['trigonometría', 'razones trigonométricas', 'teorema del seno', 'teorema del coseno', 'ángulos'],
  },
  {
    areaCodigo: 'MAT-BAS',
    gradoNumero: 11,
    numero_dba: 1,
    organizador: 'Pensamiento variacional',
    enunciado: 'Interpreta y diseña técnicas para analizar la tasa de cambio y el límite de funciones reales en contextos matemáticos y científicos.',
    evidencias_aprendizaje: [
      'Estima el valor del límite de una función cuando la variable independiente tiende a un número o al infinito.',
      'Interpreta la derivada de una función en un punto como la pendiente de la recta tangente a la curva.',
    ],
    etiquetas: ['cálculo', 'límites', 'derivadas', 'razón de cambio', 'recta tangente'],
  },

  // ==========================================
  // LENGUA CASTELLANA (Factores: Comprensión, Producción, Literatura, Medios, Ética)
  // ==========================================
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 1,
    numero_dba: 1,
    organizador: 'Comprensión e interpretación textual',
    enunciado: 'Reconoce el propósito comunicativo de los textos que lee (narrativo, instructivo, informativo) a partir de sus imágenes y palabras clave.',
    evidencias_aprendizaje: [
      'Identifica el inicio, nudo y desenlace en relatos orales y escritos sencillos.',
      'Anticipa el contenido de un texto a partir del título y las ilustraciones.',
    ],
    etiquetas: ['lectura inicial', 'narración', 'imágenes', 'comprensión'],
  },
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 4,
    numero_dba: 1,
    organizador: 'Producción textual',
    enunciado: 'Escribe textos informativos y narrativos coherentes atendiendo al propósito, al destinatario y a la estructura básica.',
    evidencias_aprendizaje: [
      'Planifica sus escritos seleccionando el tema, las ideas principales y los conectores lógicos.',
      'Revisa y corrige sus textos teniendo en cuenta la ortografía, la concordancia y los signos de puntuación.',
    ],
    ejemplo: 'Redacción de una noticia escolar sobre la inauguración del torneo deportivo intercolegial.',
    etiquetas: ['escritura', 'cohesión', 'coherencia', 'ortografía', 'texto narrativo', 'texto informativo'],
  },
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 5,
    numero_dba: 1,
    organizador: 'Literatura',
    enunciado: 'Reconoce en la lectura de los distintos géneros literarios (narrativo, lírico y dramático) las figuras retóricas y los recursos poéticos empleados por los autores.',
    evidencias_aprendizaje: [
      'Diferencia la metáfora, la personificación y el símil en poemas y canciones.',
      'Identifica la estructura de una obra teatral (acotaciones, actos, diálogos y personajes).',
    ],
    etiquetas: ['literatura', 'género lírico', 'género dramático', 'metáfora', 'poesía'],
  },
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 8,
    numero_dba: 1,
    organizador: 'Comprensión e interpretación textual',
    enunciado: 'Caracteriza los textos argumentativos a partir de la tesis formulada, los tipos de argumentos empleados y la conclusión expuesta.',
    evidencias_aprendizaje: [
      'Distingue entre argumentos de autoridad, de causa-efecto y de ejemplificación en columnas de opinión.',
      'Identifica falacias argumentativas comunes en debates y discursos públicos.',
    ],
    etiquetas: ['argumentación', 'tesis', 'columna de opinión', 'falacias', 'ensayo'],
  },
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 10,
    numero_dba: 1,
    organizador: 'Medios de comunicación y otros sistemas simbólicos',
    enunciado: 'Analiza críticamente los discursos periodísticos, publicitarios y digitales para identificar sesgos ideológicos, intencionalidades y estrategias persuasivas.',
    evidencias_aprendizaje: [
      'Evalúa la confiabilidad de fuentes de información digital y contrasta diversos puntos de vista sobre una noticia.',
      'Explica el impacto de los contenidos mediáticos en la formación de la opinión pública.',
    ],
    etiquetas: ['medios masivos', 'crítica textual', 'publicidad', 'posverdad', 'discurso'],
  },
  {
    areaCodigo: 'LEN-CAS',
    gradoNumero: 11,
    numero_dba: 1,
    organizador: 'Producción textual',
    enunciado: 'Produce ensayos de carácter académico y argumentativo en los que defiende una postura frente a problemas socioculturales con rigor conceptual.',
    evidencias_aprendizaje: [
      'Estructura el ensayo con introducción, estado de la cuestión, cuerpo argumentativo y conclusiones.',
      'Utiliza normas internacionales de citación (APA) para evitar el plagio y respaldar sus fuentes.',
    ],
    etiquetas: ['ensayo académico', 'normas APA', 'pensamiento crítico', 'investigación escolar'],
  },

  // ==========================================
  // CIENCIAS NATURALES (Entornos: Vivo, Físico, CTS; Procesos de pensamiento)
  // ==========================================
  {
    areaCodigo: 'CNAT-BAS',
    gradoNumero: 3,
    numero_dba: 1,
    organizador: 'Entorno vivo',
    enunciado: 'Comprende la influencia de la variación de la temperatura en los cambios de estado de la materia y en los ciclos de vida de plantas y animales.',
    evidencias_aprendizaje: [
      'Describe y clasifica seres vivos según su hábitat y sus adaptaciones morfofisiológicas.',
      'Representa cadenas tróficas sencillas identificando productores, consumidores y descomponedores.',
    ],
    etiquetas: ['ecosistemas', 'seres vivos', 'cadenas tróficas', 'adaptación', 'hábitat'],
  },
  {
    areaCodigo: 'CNAT-BAS',
    gradoNumero: 5,
    numero_dba: 1,
    organizador: 'Entorno vivo',
    enunciado: 'Comprende que los sistemas del cuerpo humano (digestivo, respiratorio, circulatorio, excretor) interactúan de manera coordinada para mantener la vida.',
    evidencias_aprendizaje: [
      'Explica las rutas que siguen los nutrientes y el oxígeno para llegar a las células.',
      'Propone hábitos de vida saludable, nutrición balanceada y ejercicio físico para prevenir enfermedades comunes.',
    ],
    etiquetas: ['sistemas del cuerpo', 'nutrición', 'respiración', 'célula', 'salud'],
  },
  {
    areaCodigo: 'CNAT-BAS',
    gradoNumero: 9,
    numero_dba: 1,
    organizador: 'Entorno vivo',
    enunciado: 'Explica la herencia biológica y la variabilidad genética en las poblaciones a partir de las leyes de Mendel y la estructura del ADN.',
    evidencias_aprendizaje: [
      'Resuelve cruces monohíbridos y dihíbridos utilizando cuadros de Punnett.',
      'Describe la estructura de doble hélice del ADN y los procesos de transcripción y traducción de proteínas.',
    ],
    etiquetas: ['genética', 'leyes de Mendel', 'ADN', 'ARN', 'herencia', 'cuadro de Punnett'],
  },
  {
    areaCodigo: 'CNAT-BAS',
    gradoNumero: 10,
    numero_dba: 1,
    organizador: 'Entorno físico',
    enunciado: 'Comprende que el movimiento de un cuerpo depende de la suma de las fuerzas que actúan sobre él (Leyes de Newton) y de la conservación de la energía mecánica.',
    evidencias_aprendizaje: [
      'Aplica la segunda ley de Newton (F = m·a) en planos horizontales e inclinados.',
      'Calcula la energía cinética, potencial gravitacional y energía mecánica total en sistemas ideales.',
    ],
    etiquetas: ['física', 'leyes de Newton', 'fuerza', 'energía mecánica', 'cinemática'],
  },
  {
    areaCodigo: 'CNAT-BAS',
    gradoNumero: 11,
    numero_dba: 1,
    organizador: 'Ciencia, Tecnología y Sociedad',
    enunciado: 'Analiza las propiedades periódicas de los elementos y los tipos de enlace químico (iónico, covalente y metálico) para predecir el comportamiento de las sustancias.',
    evidencias_aprendizaje: [
      'Determina la fórmula y el nombre de compuestos químicos inorgánicos y orgánicos según la IUPAC.',
      'Balancea ecuaciones de reacciones químicas por los métodos de tanteo y óxido-reducción.',
    ],
    etiquetas: ['química', 'tabla periódica', 'enlaces químicos', 'reacciones químicas', 'estequiometría'],
  },

  // ==========================================
  // CIENCIAS SOCIALES (Ejes: Historia/Cultura, Espaciales/Ambientales, Ético-Políticas)
  // ==========================================
  {
    areaCodigo: 'CS-HGD',
    gradoNumero: 4,
    numero_dba: 1,
    organizador: 'Relaciones espaciales y ambientales',
    enunciado: 'Comprende la organización territorial de Colombia y la diversidad geográfica, cultural y natural de sus regiones naturales.',
    evidencias_aprendizaje: [
      'Ubica en mapas temáticos las regiones naturales de Colombia (Andina, Caribe, Pacífica, Orinoquía, Amazonía e Insular).',
      'Describe las principales actividades económicas y recursos naturales característicos de cada región.',
    ],
    etiquetas: ['geografía', 'regiones naturales', 'Colombia', 'mapas', 'territorio'],
  },
  {
    areaCodigo: 'CS-HGD',
    gradoNumero: 7,
    numero_dba: 1,
    organizador: 'Relaciones con la historia y las culturas',
    enunciado: 'Explica los procesos de expansión europea, el encuentro cultural y la colonización en América durante los siglos XV al XVIII.',
    evidencias_aprendizaje: [
      'Analiza el impacto demográfico, social y económico del régimen colonial sobre las poblaciones indígenas y afrodescendientes.',
      'Compara las instituciones virreinales con las estructuras políticas contemporáneas.',
    ],
    etiquetas: ['historia colonial', 'conquista de América', 'virreinatos', 'cultura indígena', 'afrocolombianidad'],
  },
  {
    areaCodigo: 'CS-HGD',
    gradoNumero: 9,
    numero_dba: 1,
    organizador: 'Relaciones ético-políticas',
    enunciado: 'Analiza el conflicto armado en Colombia en la segunda mitad del siglo XX, sus causas estructurales, actores y consecuencias humanitarias.',
    evidencias_aprendizaje: [
      'Identifica momentos clave como el Frente Nacional, el surgimiento de guerrillas y paramilitares, y los procesos de paz.',
      'Valora el derecho internacional humanitario y la memoria histórica para la reconciliación y la no repetición.',
    ],
    etiquetas: ['conflicto armado', 'memoria histórica', 'derechos humanos', 'Frente Nacional', 'paz'],
  },
  {
    areaCodigo: 'CS-HGD',
    gradoNumero: 10,
    numero_dba: 1,
    organizador: 'Relaciones ético-políticas',
    enunciado: 'Analiza la Constitución Política de Colombia de 1991 como fundamento del Estado Social de Derecho y de la participación ciudadana.',
    evidencias_aprendizaje: [
      'Explica el uso de mecanismos de protección de derechos fundamentales (Acción de Tutela, Derecho de Petición, Hábeas Corpus).',
      'Reconoce la estructura de las tres ramas del poder público y los órganos de control en Colombia.',
    ],
    etiquetas: ['Constitución 1991', 'Estado Social de Derecho', 'Acción de Tutela', 'participación ciudadana'],
  },
];

const EBC_DATA: EbcSeedItem[] = [
  {
    areaCodigo: 'MAT-BAS',
    grupo_grados: '4-5',
    organizador: 'Pensamiento numérico',
    competencia: 'Razonamiento y resolución de problemas',
    enunciado: 'Interpreto las fracciones en diferentes contextos: situaciones de medición, relaciones parte-todo, cociente y operador.',
    evidencias_aprendizaje: [
      'Resuelvo y formulo problemas cuya estrategia de solución requiera de las relaciones y propiedades de los números naturales y sus operaciones.',
    ],
    etiquetas: ['EBC', 'estándar', 'fracciones', 'operador', 'cociente'],
  },
  {
    areaCodigo: 'LEN-CAS',
    grupo_grados: '6-7',
    organizador: 'Producción textual',
    competencia: 'Comunicación escrita',
    enunciado: 'Produzco textos narrativos y descriptivos en los que reconozco elementos como el tiempo, el espacio, los personajes y el narrador.',
    evidencias_aprendizaje: [
      'Defino una estructura para mis textos que responda a una intención comunicativa.',
    ],
    etiquetas: ['EBC', 'estándar', 'narrativa', 'producción escrita'],
  },
];

async function seedDba(): Promise<void> {
  const institution = await Institution.findOne();
  if (!institution) {
    throw new Error('No se encontró institución registrada. Ejecuta primero el asistente institucional.');
  }

  // 1. Asegurar la existencia de las 4 áreas troncales
  const areaMap = new Map<string, mongoose.Types.ObjectId>();
  for (const a of AREAS_OFICIALES) {
    const areaDoc = await Area.findOneAndUpdate(
      { institucion_id: institution._id, codigo: a.codigo },
      {
        $setOnInsert: {
          institucion_id: institution._id,
          codigo: a.codigo,
          nombre: a.nombre,
          descripcion: a.descripcion,
          estado: 'activo',
        },
      },
      { upsert: true, new: true }
    );
    if (areaDoc) {
      areaMap.set(a.codigo, areaDoc._id);
    }
  }
  console.log(`[seed:dba] Áreas maestras sincronizadas: ${areaMap.size}`);

  // 2. Mapear grados por su número
  const grades = await Grade.find();
  const gradeMap = new Map<number, mongoose.Types.ObjectId>();
  for (const g of grades) {
    gradeMap.set(g.numero, g._id);
  }
  console.log(`[seed:dba] Grados detectados en BD: ${gradeMap.size}`);

  // 3. Sembrar DBA
  let dbaCount = 0;
  for (const item of DBA_DATA) {
    const areaId = areaMap.get(item.areaCodigo);
    const gradeId = gradeMap.get(item.gradoNumero);

    if (!areaId) {
      console.warn(`[seed:dba] Área ${item.areaCodigo} no encontrada. Saltando.`);
      continue;
    }
    if (!gradeId) {
      console.warn(`[seed:dba] Grado número ${item.gradoNumero} no encontrado. Saltando.`);
      continue;
    }

    await DBABank.findOneAndUpdate(
      {
        tipo_referente: 'DBA',
        area_id: areaId,
        grade_id: gradeId,
        numero_dba: item.numero_dba,
      },
      {
        $set: {
          tipo_referente: 'DBA',
          area_id: areaId,
          grade_id: gradeId,
          numero_dba: item.numero_dba,
          enunciado: item.enunciado,
          evidencias_aprendizaje: item.evidencias_aprendizaje,
          organizador: item.organizador,
          eje_tematico: item.organizador,
          ejemplo: item.ejemplo || '',
          etiquetas: item.etiquetas,
          version: 'V2',
          fuente: 'MEN - Colombia Aprende',
          estado: 'activo',
        },
      },
      { upsert: true }
    );
    dbaCount++;
  }
  console.log(`[seed:dba] DBA sembrados/actualizados: ${dbaCount}`);

  // 4. Sembrar EBC
  let ebcCount = 0;
  for (const item of EBC_DATA) {
    const areaId = areaMap.get(item.areaCodigo);
    if (!areaId) continue;

    await DBABank.findOneAndUpdate(
      {
        tipo_referente: 'EBC',
        area_id: areaId,
        grupo_grados: item.grupo_grados,
        enunciado: item.enunciado,
      },
      {
        $set: {
          tipo_referente: 'EBC',
          area_id: areaId,
          grupo_grados: item.grupo_grados,
          competencia: item.competencia,
          enunciado: item.enunciado,
          evidencias_aprendizaje: item.evidencias_aprendizaje,
          organizador: item.organizador,
          eje_tematico: item.organizador,
          etiquetas: item.etiquetas,
          version: 'V1',
          fuente: 'MEN - Estándares Básicos de Competencias',
          estado: 'activo',
        },
      },
      { upsert: true }
    );
    ebcCount++;
  }
  console.log(`[seed:dba] EBC sembrados/actualizados: ${ebcCount}`);
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[seed:dba] Conectado a MongoDB.');

  await seedDba();

  await mongoose.disconnect();
  console.log('[seed:dba] Proceso completado exitosamente.');
}

run().catch((err) => {
  console.error('[seed:dba] Error en ejecución:', err);
  process.exit(1);
});
