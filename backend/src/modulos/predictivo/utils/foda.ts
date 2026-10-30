/**
 * El análisis FODA (fortalezas, oportunidades, debilidades, amenazas) de un estudiante y de cada asignatura. Los textos son datos
 * (`PLANTILLAS_FODA`, con marcas `{asignatura}`, `{nota}`…); lo que decide si una frase aplica está aquí, por su clave. Las frases están
 * en tercera persona y sin juicios: las lee el propio estudiante, su familia y el personal. Lo de convivencia solo sale a quien puede verlo
 * (audiencia `CONVIVENCIA`); para los demás la convivencia pesa en el cálculo pero no se nombra. Pura.
 *
 * Cada clave tiene varias redacciones (`textos`) para que el FODA no repita la misma frase en cada asignatura: un `Variador` elige cuál,
 * de forma determinista (mismo estudiante, mismo texto) y rotando entre las asignaturas de un mismo análisis. Una redacción que usa una
 * marca sin valor se descarta (p. ej. «subió de {primera} a {ultima}» cuando no se conocen las notas por periodo). La primera redacción de
 * cada clave es la de partida: un análisis sin variador la usa siempre.
 */
import { NivelRiesgo } from '../constants/predictivo';
import { NotaRequerida } from './notaRequerida';

export type CuadranteFoda = 'FORTALEZA' | 'OPORTUNIDAD' | 'DEBILIDAD' | 'AMENAZA';
export type AudienciaFoda = 'TODOS' | 'CONVIVENCIA';

export interface PlantillaFoda {
  clave: string;
  cuadrante: CuadranteFoda;
  alcance: 'ASIGNATURA' | 'GENERAL';
  audiencia: AudienciaFoda;
  textos: readonly string[];
}

type Base = Omit<PlantillaFoda, 'clave' | 'textos'>;
const A_F: Base = { cuadrante: 'FORTALEZA', alcance: 'ASIGNATURA', audiencia: 'TODOS' };
const A_O: Base = { cuadrante: 'OPORTUNIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS' };
const A_D: Base = { cuadrante: 'DEBILIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS' };
const A_A: Base = { cuadrante: 'AMENAZA', alcance: 'ASIGNATURA', audiencia: 'TODOS' };
const G_F: Base = { cuadrante: 'FORTALEZA', alcance: 'GENERAL', audiencia: 'TODOS' };
const G_O: Base = { cuadrante: 'OPORTUNIDAD', alcance: 'GENERAL', audiencia: 'TODOS' };
const G_D: Base = { cuadrante: 'DEBILIDAD', alcance: 'GENERAL', audiencia: 'TODOS' };
const G_A: Base = { cuadrante: 'AMENAZA', alcance: 'GENERAL', audiencia: 'TODOS' };

export const PLANTILLAS_FODA: readonly PlantillaFoda[] = [
  // ── Asignatura: fortalezas ──
  {
    clave: 'NOTA_SUPERIOR',
    ...A_F,
    textos: [
      'Su promedio en {asignatura} es {nota}, con desempeño {desempeno}: es de sus mejores resultados.',
      'Con {nota} en {asignatura} alcanza el desempeño {desempeno}.',
      '{asignatura} va en desempeño {desempeno} ({nota}): domina lo trabajado hasta ahora.',
      'En {asignatura} se destaca: {nota} de promedio, nivel {desempeno}.',
    ],
  },
  {
    clave: 'NOTA_ALTA',
    ...A_F,
    textos: [
      'Su promedio en {asignatura} es {nota} (desempeño {desempeno}).',
      'En {asignatura} lleva {nota}, un desempeño {desempeno} que le da tranquilidad.',
      '{asignatura} marcha bien: {nota} de promedio, nivel {desempeno}.',
      'Mantiene un buen nivel en {asignatura}: {nota}, desempeño {desempeno}.',
    ],
  },
  {
    clave: 'TENDENCIA_SUBE',
    ...A_F,
    textos: [
      'Ha mejorado en {asignatura} de un periodo a otro.',
      'En {asignatura} se nota el progreso: pasó de {primera} a {ultima}.',
      'Sus notas en {asignatura} van en ascenso con cada periodo.',
      'La evolución en {asignatura} es positiva: cada periodo cierra mejor que el anterior.',
    ],
  },
  {
    clave: 'MEJORA_RECIENTE',
    ...A_F,
    textos: [
      'En el último periodo mejoró en {asignatura}: subió de {penultima} a {ultima}.',
      'El periodo más reciente de {asignatura} fue mejor que el anterior.',
      'Repuntó en {asignatura} en el último periodo ({ultima}).',
    ],
  },
  {
    clave: 'CONSTANTE',
    ...A_F,
    textos: [
      'Mantiene un nivel parejo en {asignatura} en todos los periodos cerrados.',
      'Sus resultados en {asignatura} son estables: no ha tenido altibajos.',
      'En {asignatura} es constante: sus notas se sostienen periodo a periodo.',
    ],
  },
  {
    clave: 'ENTREGA_TODO',
    ...A_F,
    textos: [
      'Ha entregado todas las actividades de {asignatura}.',
      'Cumplió con todas las entregas de {asignatura}.',
      'No tiene actividades pendientes en {asignatura}: entregó las {actividades}.',
      'En {asignatura} está al día con todas sus entregas.',
    ],
  },
  {
    clave: 'ENTREGA_CASI_TODO',
    ...A_F,
    textos: [
      'Entregó el {pct_entregas} % de las actividades de {asignatura}.',
      'En {asignatura} cumple con casi todas las entregas ({pct_entregas} %).',
      'Su cumplimiento en {asignatura} es alto: {pct_entregas} % de las actividades entregadas.',
    ],
  },
  {
    clave: 'ASISTE_SIEMPRE',
    ...A_F,
    textos: [
      'No tiene fallas sin excusa en {asignatura}.',
      'Su asistencia a {asignatura} es completa.',
      'Ha estado en todas las clases registradas de {asignatura}.',
      'En {asignatura} no se ha perdido ninguna clase sin excusa.',
    ],
  },
  {
    clave: 'ASISTENCIA_ALTA',
    ...A_F,
    textos: [
      'Asiste al {pct_asistencia} % de las clases de {asignatura}.',
      'Su asistencia a {asignatura} es muy buena ({pct_asistencia} %).',
      'En {asignatura} casi no falta: {pct_asistencia} % de asistencia.',
    ],
  },
  {
    clave: 'HISTORIAL_FUERTE',
    ...A_F,
    textos: [
      'En años anteriores también le ha ido bien en {asignatura}.',
      'Su historia en {asignatura} es buena: es una asignatura que suele aprobar con holgura.',
      '{asignatura} ha sido, año tras año, uno de sus puntos fuertes.',
    ],
  },
  {
    clave: 'MEJOR_ASIGNATURA',
    ...A_F,
    textos: [
      '{asignatura} es su asignatura con mejor nota este año.',
      'De todas sus asignaturas, en {asignatura} es donde mejor le va.',
      'Su mejor resultado del año está en {asignatura}.',
    ],
  },

  // ── Asignatura: debilidades ──
  {
    clave: 'NOTA_BAJA',
    ...A_D,
    textos: [
      'Su promedio en {asignatura} es {nota}, por debajo de la nota aprobatoria ({aprobatoria}).',
      'En {asignatura} lleva {nota}: todavía no alcanza la aprobatoria ({aprobatoria}).',
      '{asignatura} va con {nota}, por debajo de los {aprobatoria} que se necesitan para aprobar.',
      'La nota de {asignatura} ({nota}) aún no llega a la aprobatoria.',
    ],
  },
  {
    clave: 'NOTA_LIMITE',
    ...A_D,
    textos: [
      'En {asignatura} lleva {nota}, apenas por encima de la aprobatoria ({aprobatoria}).',
      'Su nota en {asignatura} ({nota}) está muy cerca del límite para aprobar.',
      'Con {nota}, {asignatura} va justo en la línea de la aprobatoria: cualquier baja la deja por debajo.',
    ],
  },
  {
    clave: 'TENDENCIA_BAJA',
    ...A_D,
    textos: [
      'Su nota en {asignatura} bajó del primer periodo al último.',
      'Sus notas en {asignatura} vienen bajando: de {primera} a {ultima}.',
      'En {asignatura} el rendimiento ha ido a menos con los periodos.',
      '{asignatura} muestra una tendencia a la baja que conviene frenar.',
    ],
  },
  {
    clave: 'CAIDA_RECIENTE',
    ...A_D,
    textos: [
      'En el último periodo bajó en {asignatura}: de {penultima} a {ultima}.',
      'El periodo más reciente de {asignatura} fue más flojo que el anterior.',
      'Tuvo un retroceso en {asignatura} en el último periodo ({ultima}).',
    ],
  },
  {
    clave: 'NO_ENTREGAS',
    ...A_D,
    textos: [
      'No entregó {no_entregadas} de {actividades} de {asignatura}.',
      'Tiene {no_entregadas} sin entregar de {actividades} en {asignatura}.',
      'En {asignatura} su cumplimiento de entregas es del {pct_entregas} %.',
      'Las entregas de {asignatura} están incompletas: faltaron {no_entregadas} de {actividades}.',
    ],
  },
  {
    clave: 'INASISTENCIA',
    ...A_D,
    textos: [
      'Faltó sin excusa a {fallas} de {asignatura} ({pct} %).',
      'En {asignatura} acumula {fallas} sin excusa, el {pct} % de las registradas.',
      'Su asistencia a {asignatura} es del {pct_asistencia} %: se ha perdido {fallas} sin excusa.',
      'Las ausencias sin excusa pesan en {asignatura}: {fallas} ({pct} %).',
    ],
  },
  {
    clave: 'HISTORIAL_DEBIL',
    ...A_D,
    textos: [
      'En años anteriores {asignatura} también le ha costado.',
      'Su historia en {asignatura} muestra dificultades: la perdió {perdidas_hist} en años anteriores.',
      '{asignatura} es una asignatura que le ha exigido más de lo normal en años pasados.',
    ],
  },
  {
    clave: 'MAS_DEBIL',
    ...A_D,
    textos: [
      '{asignatura} es la asignatura donde tiene la nota más baja este año.',
      'De todas sus asignaturas, {asignatura} es la que más le cuesta.',
      'Su resultado más bajo del año está en {asignatura}.',
    ],
  },

  // ── Asignatura: oportunidades ──
  {
    clave: 'ALCANZABLE',
    ...A_O,
    textos: [
      'Para aprobar {asignatura} le basta un promedio de {requerida} en {restantes}.',
      'Aún está a tiempo en {asignatura}: necesita {requerida} en {restantes}.',
      'La meta en {asignatura} es clara: {requerida} de promedio en {restantes}.',
      'Con {requerida} en {restantes}, {asignatura} queda aprobada.',
    ],
  },
  {
    clave: 'MANTENER_NIVEL',
    ...A_O,
    textos: [
      'Si mantiene su nivel en {asignatura} aprueba: le basta {requerida} en {restantes}.',
      'En {asignatura} solo necesita sostener lo que lleva: {requerida} en {restantes}.',
      'Con el ritmo actual {asignatura} sale adelante; la meta es {requerida} en {restantes}.',
    ],
  },
  {
    clave: 'ASEGURADA',
    ...A_O,
    textos: [
      'Con lo que lleva, aprobaría {asignatura} aun con la nota mínima en lo que falta.',
      '{asignatura} ya está asegurada: lo que viene es para subir su nota.',
      'En {asignatura} ya tiene la nota para aprobar; puede apuntar a un mejor desempeño.',
    ],
  },
  {
    clave: 'ANIO_ANTERIOR_BUENO',
    ...A_O,
    textos: [
      'El año anterior le fue bien en esta asignatura: es una base para apoyarse.',
      'Su buen resultado del año pasado en {asignatura} es un punto de partida a favor.',
      'En {asignatura} viene de un buen año: tiene con qué arrancar bien.',
    ],
  },
  {
    clave: 'PONERSE_AL_DIA',
    ...A_O,
    textos: [
      'Ponerse al día con las {no_entregadas} pendientes de {asignatura} puede subir su nota.',
      'Entregar lo pendiente de {asignatura} es la forma más directa de mejorar.',
      'Cumplir con las entregas que le faltan en {asignatura} le daría un impulso.',
    ],
  },
  {
    clave: 'MEJORAR_ASISTENCIA',
    ...A_O,
    textos: [
      'Asistir con regularidad a {asignatura} es lo que más le puede ayudar ahora.',
      'Recuperar la asistencia a {asignatura} haría más fácil ponerse al día.',
      'Si no se pierde más clases de {asignatura}, tendrá más opciones de mejorar.',
    ],
  },
  {
    clave: 'TIEMPO_PARA_CORREGIR',
    ...A_O,
    textos: [
      'Quedan {restantes_n} periodos para corregir el rumbo en {asignatura}.',
      'Todavía hay tiempo en {asignatura}: faltan {restantes_n} periodos.',
      'Con {restantes_n} periodos por delante, {asignatura} se puede recuperar.',
    ],
  },
  {
    clave: 'APROVECHAR_MEJORA',
    ...A_O,
    textos: [
      'La mejora reciente en {asignatura} es una buena señal: conviene sostenerla.',
      'Va subiendo en {asignatura}; si mantiene ese impulso puede llegar a la meta.',
      'El repunte en {asignatura} muestra que puede lograrlo.',
    ],
  },

  // ── Asignatura: amenazas ──
  {
    clave: 'RIESGO_ALTO',
    ...A_A,
    textos: [
      'Si sigue así, es probable que pierda {asignatura}.',
      'De seguir con este ritmo, {asignatura} podría quedar perdida al final del año.',
      'Las señales apuntan a que {asignatura} está en peligro de perderse.',
      '{asignatura} necesita atención inmediata: la posibilidad de perderla es alta.',
    ],
  },
  {
    clave: 'RIESGO_MEDIO',
    ...A_A,
    textos: [
      'Hay riesgo de perder {asignatura}: conviene reforzarla.',
      '{asignatura} no está segura todavía: un descuido podría costarla.',
      'Conviene no bajar la guardia en {asignatura}: hay un riesgo moderado de perderla.',
    ],
  },
  {
    clave: 'NO_ALCANZA',
    ...A_A,
    textos: [
      'Aun con la nota máxima en lo que falta no alcanzaría a aprobar {asignatura}: tendrá que presentar la recuperación.',
      'Con las notas que lleva, {asignatura} ya no se aprueba en los periodos: queda la recuperación.',
      'La aprobatoria de {asignatura} ya no se alcanza con los periodos que faltan; la salida es la recuperación.',
    ],
  },
  {
    clave: 'PERDIDA',
    ...A_A,
    textos: [
      'Perdió {asignatura} en el año (definitiva {definitiva}).',
      '{asignatura} cerró el año con {definitiva}, por debajo de la aprobatoria.',
      'La definitiva de {asignatura} quedó en {definitiva}: tendrá que recuperarla.',
    ],
  },
  {
    clave: 'REQUERIDA_ALTA',
    ...A_A,
    textos: [
      'La nota que necesita en {asignatura} ({requerida}) es exigente: no hay margen para bajar.',
      'Para aprobar {asignatura} le toca sacar {requerida}, una meta alta.',
      'En {asignatura} la meta de {requerida} deja poco espacio para errores.',
    ],
  },
  {
    clave: 'HISTORIAL_REPITE',
    ...A_A,
    textos: [
      'Ya perdió {asignatura} antes y este año va por un camino parecido.',
      'En {asignatura} se repite una dificultad de años anteriores.',
      'Su historia en {asignatura} y lo que lleva este año apuntan a la misma dificultad.',
    ],
  },
  {
    clave: 'INASISTENCIA_CRITICA',
    ...A_A,
    textos: [
      'Las fallas sin excusa en {asignatura} ({pct} %) pueden afectar su aprobación según el SIEE del colegio.',
      'Con {pct} % de fallas sin excusa, {asignatura} corre peligro por inasistencia.',
      'El nivel de ausencias en {asignatura} ({pct} %) ya es preocupante.',
    ],
  },

  // ── General: fortalezas ──
  {
    clave: 'GEN_PROMEDIO_SUPERIOR',
    ...G_F,
    textos: [
      'Su promedio general es {promedio}, con desempeño {desempeno}.',
      'Tiene un rendimiento sobresaliente: {promedio} de promedio general.',
      'Con {promedio} de promedio, su desempeño general es {desempeno}.',
    ],
  },
  {
    clave: 'GEN_PROMEDIO_ALTO',
    ...G_F,
    textos: [
      'Su promedio general es {promedio} (desempeño {desempeno}).',
      'Lleva un buen año: {promedio} de promedio general, desempeño {desempeno}.',
      'En general le va bien: promedio de {promedio}, nivel {desempeno}.',
    ],
  },
  {
    clave: 'GEN_ASEGURADAS',
    ...G_F,
    textos: [
      'Con lo que lleva ya tiene asegurado aprobar: {aseguradas}.',
      'Ya tiene la nota para aprobar {aseguradas}.',
      'Asignaturas que ya tiene ganadas: {aseguradas}.',
    ],
  },
  {
    clave: 'GEN_SIN_PERDIDAS',
    ...G_F,
    textos: [
      'No tiene asignaturas por debajo de la aprobatoria en los periodos cerrados.',
      'Va aprobando todas sus asignaturas.',
      'Ninguna de sus asignaturas está por debajo de la aprobatoria.',
    ],
  },
  {
    clave: 'GEN_ASISTENCIA_EJEMPLAR',
    ...G_F,
    textos: [
      'Su asistencia es muy buena: {pct_asistencia} % de las clases.',
      'Casi no falta a clase ({pct_asistencia} % de asistencia).',
      'Es constante en su asistencia: {pct_asistencia} %.',
    ],
  },
  {
    clave: 'GEN_CUMPLIMIENTO',
    ...G_F,
    textos: [
      'Cumple con sus entregas: {pct_entregas} % de las actividades.',
      'Es responsable con las actividades: entregó el {pct_entregas} %.',
      'Su cumplimiento de actividades es alto ({pct_entregas} %).',
    ],
  },
  {
    clave: 'GEN_MEJORES',
    ...G_F,
    textos: [
      'Sus mejores resultados están en {mejores}.',
      'Donde más se destaca es en {mejores}.',
      'Le va especialmente bien en {mejores}.',
    ],
  },
  {
    clave: 'GEN_MEJORA',
    ...G_F,
    textos: [
      'Su promedio ha mejorado: de {promedio_primero} en el primer periodo a {promedio_ultimo} en el último.',
      'Va de menos a más en el año: su promedio subió con los periodos.',
      'Se nota una mejora general en su rendimiento a lo largo del año.',
    ],
  },
  {
    clave: 'GEN_ANIO_ANTERIOR_BUENO',
    ...G_F,
    textos: [
      'Viene de cerrar bien el año anterior: tiene bases sólidas.',
      'Su buen año anterior es un respaldo para este.',
      'Su historia académica reciente es positiva.',
    ],
  },
  {
    clave: 'GEN_SIN_FALTAS_GRAVES',
    cuadrante: 'FORTALEZA',
    alcance: 'GENERAL',
    audiencia: 'CONVIVENCIA',
    textos: ['No tiene faltas de convivencia Tipo II o III este año.', 'Su convivencia no registra faltas Tipo II o III este año.'],
  },

  // ── General: debilidades ──
  {
    clave: 'GEN_PERDIDAS',
    ...G_D,
    textos: [
      'Va perdiendo {perdidas} en los periodos cerrados.',
      'Tiene {perdidas} por debajo de la aprobatoria.',
      'Por ahora no aprueba {perdidas}.',
    ],
  },
  {
    clave: 'GEN_DEBILES',
    ...G_D,
    textos: [
      'Las asignaturas que más le cuestan son {debiles}.',
      'Sus resultados más bajos están en {debiles}.',
      'Necesita reforzar {debiles}.',
    ],
  },
  {
    clave: 'GEN_INASISTENCIA',
    ...G_D,
    textos: [
      'Faltó sin excusa al {pct} % de sus clases.',
      'Su asistencia general es del {pct_asistencia} %: tiene ausencias sin excusa que pesan.',
      'Las fallas sin excusa ya suman el {pct} % de sus clases.',
    ],
  },
  {
    clave: 'GEN_INCUMPLIMIENTO',
    ...G_D,
    textos: [
      'Entregó solo el {pct_entregas} % de sus actividades.',
      'Tiene actividades sin entregar en varias asignaturas ({pct_entregas} % de cumplimiento).',
      'El cumplimiento de entregas es bajo: {pct_entregas} %.',
    ],
  },
  {
    clave: 'GEN_PROMEDIO_LIMITE',
    ...G_D,
    textos: [
      'Su promedio general ({promedio}) está cerca del límite de la aprobatoria.',
      'Con {promedio} de promedio va justo: tiene poco margen.',
      'Su promedio general se mueve al borde de la aprobatoria.',
    ],
  },
  {
    clave: 'GEN_CAIDA',
    ...G_D,
    textos: [
      'Su promedio ha bajado: de {promedio_primero} en el primer periodo a {promedio_ultimo} en el último.',
      'Su rendimiento general viene en descenso con los periodos.',
      'Va de más a menos en el año: su promedio bajó.',
    ],
  },

  // ── General: oportunidades ──
  {
    clave: 'GEN_RECUPERABLES',
    ...G_O,
    textos: [
      'Las asignaturas en riesgo aún se pueden aprobar en los periodos que faltan: {asignaturas}.',
      'Todavía está a tiempo de sacar adelante {asignaturas}.',
      'Con esfuerzo en lo que queda del año puede aprobar {asignaturas}.',
    ],
  },
  {
    clave: 'GEN_PONERSE_AL_DIA',
    ...G_O,
    textos: [
      'Tiene actividades pendientes en {pendientes}: entregarlas es una forma directa de subir sus notas.',
      'Ponerse al día con lo pendiente en {pendientes} le daría un impulso.',
      'Cumplir con las entregas que faltan en {pendientes} mejoraría su rendimiento.',
    ],
  },
  {
    clave: 'GEN_APOYARSE',
    ...G_O,
    textos: [
      'Puede apoyarse en lo que le va bien ({mejores}) para organizar su estudio.',
      'Sus buenos resultados en {mejores} muestran hábitos que puede llevar a las demás asignaturas.',
      'Lo que le funciona en {mejores} es un buen punto de partida para el resto.',
    ],
  },
  {
    clave: 'GEN_TIEMPO',
    ...G_O,
    textos: [
      'Quedan {restantes_n} periodos: hay tiempo para cambiar el rumbo.',
      'Con {restantes_n} periodos por delante, todavía puede mejorar su año.',
      'El año aún no se define: faltan {restantes_n} periodos.',
    ],
  },
  {
    clave: 'GEN_INICIO',
    ...G_O,
    textos: [
      'El año apenas comienza: todas las asignaturas están por definirse.',
      'Recién empieza el año; es el mejor momento para arrancar con buen ritmo.',
      'Con el año recién abierto, cada asignatura empieza de cero.',
    ],
  },

  // ── General: amenazas ──
  {
    clave: 'GEN_RIESGO_NO_PROMOCION',
    ...G_A,
    textos: [
      'Con su rendimiento actual hay riesgo de no ser promovido al grado siguiente.',
      'Si nada cambia, la promoción al grado siguiente está en riesgo.',
      'Su rendimiento actual pone en duda la promoción al siguiente grado.',
    ],
  },
  {
    clave: 'GEN_RIESGO_RECUPERACION',
    ...G_A,
    textos: [
      'Con su rendimiento actual es probable que tenga que presentar la recuperación final.',
      'Si sigue así, es posible que el año termine con recuperación final.',
      'Hay asignaturas que podrían llevarlo a la recuperación final.',
    ],
  },
  {
    clave: 'GEN_VARIAS_EN_RIESGO',
    ...G_A,
    textos: [
      'Tiene varias asignaturas en riesgo al mismo tiempo: {en_riesgo}.',
      'El riesgo está repartido en varias asignaturas ({en_riesgo}).',
      'Varias asignaturas necesitan atención a la vez: {en_riesgo}.',
    ],
  },
  {
    clave: 'GEN_INASISTENCIA_CRITICA',
    ...G_A,
    textos: [
      'Su nivel de ausencias sin excusa ({pct} %) puede comprometer el año según el SIEE del colegio.',
      'Con {pct} % de fallas sin excusa, la inasistencia ya es un riesgo para su año.',
      'Las ausencias sin excusa ({pct} %) son una amenaza seria para su promoción.',
    ],
  },
  {
    clave: 'GEN_CONVIVENCIA',
    cuadrante: 'AMENAZA',
    alcance: 'GENERAL',
    audiencia: 'CONVIVENCIA',
    textos: ['Tiene {faltas} de convivencia Tipo II o III este año.', 'Registra {faltas} de convivencia Tipo II o III este año.'],
  },
];

/** Umbrales de presentación del FODA (cuándo una frase vale la pena), no de la evaluación: esa es del colegio. */
export const UMBRALES_FODA = {
  /** % de inasistencia sin excusa que se menciona (por asignatura y en general). */
  inasistencia: 0.1,
  /** % de inasistencia sin excusa que ya es una amenaza (por asignatura y en general). */
  inasistencia_critica: 0.2,
  inasistencia_critica_general: 0.15,
  /** Asistencia que se reconoce como fortaleza. */
  asistencia_alta: 0.95,
  asistencia_ejemplar: 0.97,
  /** Fracción de actividades sin entregar que se menciona. */
  no_entregadas: 0.2,
  /** Cumplimiento de entregas que se reconoce, y el que se señala como bajo (en general). */
  entregas_altas: 0.85,
  cumplimiento_general: 0.9,
  incumplimiento_general: 0.8,
  /** Riesgo de no promoción o de recuperación (fracción de simulaciones) que se menciona. */
  riesgo_general: 0.3,
  /** Fracción del rango de la escala que se considera «cerca de la aprobatoria», «cambio de nota» o «estable». */
  margen_limite: 0.075,
  cambio: 0.075,
  /** Nota normalizada del historial que se considera buena, y la nota requerida (fracción entre la aprobatoria y la máxima) que es exigente. */
  historial_bueno: 0.7,
  requerida_exigente: 0.6,
  /** Asignaturas en riesgo a la vez que ya son una amenaza general. */
  varias_en_riesgo: 3,
} as const;

/** El historial de una asignatura en años anteriores (ver `historial.ts`), resumido para el FODA. */
export interface HistorialFoda {
  anios: number;
  perdidas: number;
  /** Promedio normalizado 0–1; null sin años. */
  promedio: number | null;
}

export interface ResumenAsignaturaFoda {
  nombre: string;
  /** Promedio de los periodos cerrados en la escala del colegio; null sin notas. */
  nota: number | null;
  /** Nivel y etiqueta del desempeño de esa nota según la escala del año. */
  nivel: 'BAJO' | 'BASICO' | 'ALTO' | 'SUPERIOR' | null;
  desempeno: string | null;
  tendencia: 'SUBE' | 'BAJA' | 'ESTABLE' | null;
  actividades: number;
  no_entregadas: number;
  registros: number;
  fallas: number;
  nota_requerida: NotaRequerida;
  riesgo: NivelRiesgo | null;
  /** Normalizada 0–1; null si no hubo año anterior. */
  nota_anio_anterior: number | null;
  /** Notas cerradas de los periodos, en orden. Opcional: sin ellas no salen las frases de cambio reciente. */
  notas_periodos?: number[];
  /** Escala del año. Opcional: sin ella no salen las frases que miden contra la máxima o en proporción al rango. */
  minima?: number;
  maxima?: number;
  historial?: HistorialFoda;
  es_mejor?: boolean;
  es_mas_debil?: boolean;
}

export interface ResumenGeneralFoda {
  promedio: number | null;
  nivel: 'BAJO' | 'BASICO' | 'ALTO' | 'SUPERIOR' | null;
  desempeno: string | null;
  perdidas: number;
  registros: number;
  fallas: number;
  faltas_graves: number;
  hay_periodos_cerrados: boolean;
  riesgo_no_promocion: number | null;
  riesgo_recuperacion: number | null;
  /** Lo que sigue es opcional: sin el dato, la frase que lo usa no sale. */
  actividades?: number;
  no_entregadas?: number;
  aprobatoria?: number;
  minima?: number;
  maxima?: number;
  /** Promedio de todas las asignaturas en el primer y en el último periodo cerrado. */
  promedio_primero?: number | null;
  promedio_ultimo?: number | null;
  periodos_restantes?: number;
  mejores?: string[];
  debiles?: string[];
  en_riesgo?: string[];
  con_pendientes?: string[];
  /** Promedio normalizado (0–1) del año anterior. */
  promedio_anio_anterior?: number | null;
}

export interface ElementoFoda {
  clave: string;
  texto: string;
}

export interface Foda {
  fortalezas: ElementoFoda[];
  oportunidades: ElementoFoda[];
  debilidades: ElementoFoda[];
  amenazas: ElementoFoda[];
}

const CUADRANTE: Record<CuadranteFoda, keyof Foda> = { FORTALEZA: 'fortalezas', OPORTUNIDAD: 'oportunidades', DEBILIDAD: 'debilidades', AMENAZA: 'amenazas' };

/** «1 asignatura», «3 asignaturas»: las frases llevan el sustantivo ya concordado con la cantidad. */
export const cantidad = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;

/** «Matemáticas», «Matemáticas y Física», «Matemáticas, Física y Química». */
export const lista = (nombres: string[]): string =>
  nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

export function rellenar(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (marca, clave: string) => (clave in valores ? String(valores[clave]) : marca));
}

/** Elige la redacción de una clave: devuelve un número que se toma módulo la cantidad de redacciones. */
export type Variador = (clave: string) => number;

const PRIMERA: Variador = () => 0;

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Un variador para UN análisis: la primera vez que aparece una clave arranca en una redacción que depende de la semilla (el estudiante)
 * y cada vez que se repite en otra asignatura pasa a la siguiente, así dos asignaturas seguidas no dicen lo mismo con las mismas palabras.
 */
export function crearVariador(semilla: string): Variador {
  const usos = new Map<string, number>();
  return (clave) => {
    const n = usos.get(clave) ?? 0;
    usos.set(clave, n + 1);
    return hash(`${semilla}|${clave}`) + n;
  };
}

const pct = (parte: number, total: number): number => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);
const periodosTexto = (n: number): string => (n === 1 ? 'el periodo que falta' : `los ${n} periodos que faltan`);
const marcasDe = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');

/** Valores de las marcas; `undefined` o '' = no se conoce, y la redacción que lo usa se descarta. */
type Valores = Record<string, string | number | undefined>;

function armar(claves: string[], valores: Valores, verConvivencia: boolean, variar: Variador): Foda {
  const foda: Foda = { fortalezas: [], oportunidades: [], debilidades: [], amenazas: [] };
  const conocidos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string | number>;
  for (const clave of claves) {
    const plantilla = PLANTILLAS_FODA.find((p) => p.clave === clave);
    if (!plantilla || (plantilla.audiencia === 'CONVIVENCIA' && !verConvivencia)) continue;
    const posibles = plantilla.textos.filter((t) => marcasDe(t).every((m) => m in conocidos));
    if (posibles.length === 0) continue;
    const texto = posibles[variar(clave) % posibles.length] ?? posibles[0] ?? '';
    foda[CUADRANTE[plantilla.cuadrante]].push({ clave, texto: rellenar(texto, conocidos) });
  }
  return foda;
}

export function fodaDeAsignatura(a: ResumenAsignaturaFoda, aprobatoria: number, decimales = 1, variar: Variador = PRIMERA): Foda {
  const fijo = (v: number | null | undefined): string | undefined => (v === null || v === undefined ? undefined : v.toFixed(decimales));
  const claves: string[] = [];
  const req = a.nota_requerida;
  const decidida = req.estado === 'APROBADA' || req.estado === 'ASEGURADA' || req.estado === 'PERDIDA' || req.estado === 'NO_ALCANZA';
  const rango = a.minima !== undefined && a.maxima !== undefined ? a.maxima - a.minima : null;
  const margen = (rango ?? 4) * UMBRALES_FODA.margen_limite;
  const notas = a.notas_periodos ?? [];
  const ultima = notas[notas.length - 1] ?? null;
  const penultima = notas.length > 1 ? (notas[notas.length - 2] ?? null) : null;
  const ratioFallas = a.registros > 0 ? a.fallas / a.registros : null;
  const ratioEntregas = a.actividades > 0 ? (a.actividades - a.no_entregadas) / a.actividades : null;
  const aprobNorm = rango ? (aprobatoria - (a.minima as number)) / rango : null;
  const hist = a.historial;
  const histBueno = !!hist && hist.anios > 0 && hist.perdidas === 0 && hist.promedio !== null && hist.promedio >= UMBRALES_FODA.historial_bueno;
  const histDebil = !!hist && hist.anios > 0 && (hist.perdidas > 0 || (hist.promedio !== null && aprobNorm !== null && hist.promedio < aprobNorm + UMBRALES_FODA.margen_limite));
  const cambioReciente = penultima !== null && ultima !== null && a.tendencia !== 'SUBE' && a.tendencia !== 'BAJA' ? ultima - penultima : 0;

  // Fortalezas
  if (a.nota !== null && a.nivel === 'SUPERIOR') claves.push('NOTA_SUPERIOR');
  else if (a.nota !== null && a.nivel === 'ALTO') claves.push('NOTA_ALTA');
  if (a.tendencia === 'SUBE') claves.push('TENDENCIA_SUBE');
  if (notas.length >= 3 && cambioReciente >= margen) claves.push('MEJORA_RECIENTE');
  if (notas.length >= 2 && a.tendencia === 'ESTABLE' && notas.every((n) => n >= aprobatoria + margen) && Math.max(...notas) - Math.min(...notas) <= margen) claves.push('CONSTANTE');
  if (a.actividades > 0 && a.no_entregadas === 0) claves.push('ENTREGA_TODO');
  else if (ratioEntregas !== null && ratioEntregas >= UMBRALES_FODA.entregas_altas) claves.push('ENTREGA_CASI_TODO');
  if (a.registros > 0 && a.fallas === 0) claves.push('ASISTE_SIEMPRE');
  else if (ratioFallas !== null && 1 - ratioFallas >= UMBRALES_FODA.asistencia_alta) claves.push('ASISTENCIA_ALTA');
  if (histBueno) claves.push('HISTORIAL_FUERTE');
  if (a.es_mejor) claves.push('MEJOR_ASIGNATURA');

  // Debilidades
  if (a.nota !== null && a.nota < aprobatoria) claves.push('NOTA_BAJA');
  else if (a.nota !== null && a.nota < aprobatoria + margen && rango !== null) claves.push('NOTA_LIMITE');
  if (a.tendencia === 'BAJA') claves.push('TENDENCIA_BAJA');
  if (notas.length >= 3 && cambioReciente <= -margen) claves.push('CAIDA_RECIENTE');
  if (a.actividades > 0 && a.no_entregadas / a.actividades >= UMBRALES_FODA.no_entregadas) claves.push('NO_ENTREGAS');
  if (ratioFallas !== null && ratioFallas >= UMBRALES_FODA.inasistencia) claves.push('INASISTENCIA');
  if (histDebil) claves.push('HISTORIAL_DEBIL');
  if (a.es_mas_debil) claves.push('MAS_DEBIL');

  // Oportunidades
  if (req.estado === 'ALCANZABLE') claves.push(a.nota !== null && req.nota !== null && req.nota <= a.nota ? 'MANTENER_NIVEL' : 'ALCANZABLE');
  if (req.estado === 'ASEGURADA') claves.push('ASEGURADA');
  if (a.nota === null && a.nota_anio_anterior !== null && a.nota_anio_anterior >= 0.6) claves.push('ANIO_ANTERIOR_BUENO');
  if (!decidida && a.no_entregadas > 0 && claves.includes('NO_ENTREGAS')) claves.push('PONERSE_AL_DIA');
  if (!decidida && claves.includes('INASISTENCIA')) claves.push('MEJORAR_ASISTENCIA');
  if (!decidida && req.periodos_restantes >= 2 && (a.riesgo === 'ALTO' || a.riesgo === 'MEDIO' || (a.nota !== null && a.nota < aprobatoria))) claves.push('TIEMPO_PARA_CORREGIR');
  if (!decidida && (a.tendencia === 'SUBE' || cambioReciente >= margen) && a.nota !== null && a.nota < aprobatoria + margen) claves.push('APROVECHAR_MEJORA');

  // Amenazas
  if (req.estado === 'NO_ALCANZA') claves.push('NO_ALCANZA');
  else if (req.estado === 'PERDIDA') claves.push('PERDIDA');
  else if (!decidida) {
    if (a.riesgo === 'ALTO') claves.push('RIESGO_ALTO');
    else if (a.riesgo === 'MEDIO') claves.push('RIESGO_MEDIO');
  }
  if (req.estado === 'ALCANZABLE' && req.nota !== null && a.maxima !== undefined && req.nota >= aprobatoria + (a.maxima - aprobatoria) * UMBRALES_FODA.requerida_exigente) claves.push('REQUERIDA_ALTA');
  if (!decidida && hist && hist.perdidas > 0 && ((a.nota !== null && a.nota < aprobatoria) || a.riesgo === 'ALTO' || a.riesgo === 'MEDIO')) claves.push('HISTORIAL_REPITE');
  if (ratioFallas !== null && ratioFallas >= UMBRALES_FODA.inasistencia_critica) claves.push('INASISTENCIA_CRITICA');

  return armar(
    claves,
    {
      asignatura: a.nombre,
      nota: fijo(a.nota),
      desempeno: (a.desempeno ?? '').toLowerCase(),
      aprobatoria: fijo(aprobatoria),
      no_entregadas: a.no_entregadas,
      actividades: cantidad(a.actividades, 'actividad', 'actividades'),
      fallas: cantidad(a.fallas, 'clase', 'clases'),
      pct: pct(a.fallas, a.registros),
      pct_asistencia: a.registros > 0 ? pct(a.registros - a.fallas, a.registros) : undefined,
      pct_entregas: a.actividades > 0 ? pct(a.actividades - a.no_entregadas, a.actividades) : undefined,
      requerida: fijo(req.nota),
      restantes: periodosTexto(req.periodos_restantes),
      restantes_n: req.periodos_restantes,
      definitiva: fijo(req.definitiva),
      primera: notas.length >= 2 ? fijo(notas[0]) : undefined,
      ultima: notas.length >= 2 ? fijo(ultima) : undefined,
      penultima: fijo(penultima),
      perdidas_hist: hist && hist.perdidas > 0 ? cantidad(hist.perdidas, 'vez', 'veces') : undefined,
    },
    false,
    variar
  );
}

export function fodaGeneral(g: ResumenGeneralFoda, recuperables: string[], verConvivencia: boolean, aseguradas: string[] = [], variar: Variador = PRIMERA): Foda {
  const claves: string[] = [];
  const rango = g.minima !== undefined && g.maxima !== undefined ? g.maxima - g.minima : null;
  const margen = (rango ?? 4) * UMBRALES_FODA.margen_limite;
  const ratioFallas = g.registros > 0 ? g.fallas / g.registros : null;
  const actividades = g.actividades ?? 0;
  const ratioEntregas = actividades > 0 ? (actividades - (g.no_entregadas ?? 0)) / actividades : null;
  const cambio = g.promedio_primero != null && g.promedio_ultimo != null ? g.promedio_ultimo - g.promedio_primero : 0;
  const mejores = g.mejores ?? [];
  const debiles = g.debiles ?? [];
  const restantes = g.periodos_restantes ?? 0;

  // Fortalezas
  if (g.promedio !== null && g.nivel === 'SUPERIOR') claves.push('GEN_PROMEDIO_SUPERIOR');
  else if (g.promedio !== null && g.nivel === 'ALTO') claves.push('GEN_PROMEDIO_ALTO');
  if (aseguradas.length > 0) claves.push('GEN_ASEGURADAS');
  if (g.hay_periodos_cerrados && g.perdidas === 0) claves.push('GEN_SIN_PERDIDAS');
  if (ratioFallas !== null && 1 - ratioFallas >= UMBRALES_FODA.asistencia_ejemplar) claves.push('GEN_ASISTENCIA_EJEMPLAR');
  if (ratioEntregas !== null && ratioEntregas >= UMBRALES_FODA.cumplimiento_general) claves.push('GEN_CUMPLIMIENTO');
  if (mejores.length > 0) claves.push('GEN_MEJORES');
  if (cambio >= margen) claves.push('GEN_MEJORA');
  if (!g.hay_periodos_cerrados && (g.promedio_anio_anterior ?? 0) >= UMBRALES_FODA.historial_bueno) claves.push('GEN_ANIO_ANTERIOR_BUENO');
  if (g.hay_periodos_cerrados && g.faltas_graves === 0) claves.push('GEN_SIN_FALTAS_GRAVES');

  // Debilidades
  if (g.perdidas > 0) claves.push('GEN_PERDIDAS');
  if (debiles.length > 0) claves.push('GEN_DEBILES');
  if (ratioFallas !== null && ratioFallas >= UMBRALES_FODA.inasistencia) claves.push('GEN_INASISTENCIA');
  if (ratioEntregas !== null && ratioEntregas < UMBRALES_FODA.incumplimiento_general) claves.push('GEN_INCUMPLIMIENTO');
  if (g.promedio !== null && g.aprobatoria !== undefined && g.promedio >= g.aprobatoria && g.promedio < g.aprobatoria + margen) claves.push('GEN_PROMEDIO_LIMITE');
  if (cambio <= -margen) claves.push('GEN_CAIDA');

  // Oportunidades
  if (recuperables.length > 0) claves.push('GEN_RECUPERABLES');
  if ((g.con_pendientes ?? []).length > 0) claves.push('GEN_PONERSE_AL_DIA');
  if (mejores.length > 0 && (g.perdidas > 0 || debiles.length > 0)) claves.push('GEN_APOYARSE');
  if (g.hay_periodos_cerrados && restantes >= 2 && (g.perdidas > 0 || recuperables.length > 0)) claves.push('GEN_TIEMPO');
  if (!g.hay_periodos_cerrados && g.periodos_restantes !== undefined) claves.push('GEN_INICIO');

  // Amenazas
  if ((g.riesgo_no_promocion ?? 0) >= UMBRALES_FODA.riesgo_general) claves.push('GEN_RIESGO_NO_PROMOCION');
  else if ((g.riesgo_recuperacion ?? 0) >= UMBRALES_FODA.riesgo_general) claves.push('GEN_RIESGO_RECUPERACION');
  if ((g.en_riesgo ?? []).length >= UMBRALES_FODA.varias_en_riesgo) claves.push('GEN_VARIAS_EN_RIESGO');
  if (ratioFallas !== null && ratioFallas >= UMBRALES_FODA.inasistencia_critica_general) claves.push('GEN_INASISTENCIA_CRITICA');
  if (g.faltas_graves > 0) claves.push('GEN_CONVIVENCIA');

  const dosDecimales = (v: number | null | undefined) => (v === null || v === undefined ? undefined : Math.round(v * 100) / 100);
  return armar(
    claves,
    {
      promedio: g.promedio ?? undefined,
      desempeno: (g.desempeno ?? '').toLowerCase(),
      perdidas: cantidad(g.perdidas, 'asignatura', 'asignaturas'),
      pct: pct(g.fallas, g.registros),
      pct_asistencia: g.registros > 0 ? pct(g.registros - g.fallas, g.registros) : undefined,
      pct_entregas: actividades > 0 ? pct(actividades - (g.no_entregadas ?? 0), actividades) : undefined,
      asignaturas: lista(recuperables),
      faltas: cantidad(g.faltas_graves, 'falta', 'faltas'),
      aseguradas: aseguradas.join(', '),
      mejores: lista(mejores),
      debiles: lista(debiles),
      en_riesgo: lista(g.en_riesgo ?? []),
      pendientes: lista(g.con_pendientes ?? []),
      promedio_primero: dosDecimales(g.promedio_primero),
      promedio_ultimo: dosDecimales(g.promedio_ultimo),
      restantes_n: restantes,
    },
    verConvivencia,
    variar
  );
}
