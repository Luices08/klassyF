import { Types } from 'mongoose';
import AcademicYear, { AcademicYearDocument } from '../../institucional/calendario/academicYear.model';
import Area from './area.model';
import Grade, { GradeDocument } from '../../institucional/estructura/grade.model';
import Group from '../../institucional/estructura/group.model';
import StudyPlan, {
  IAsignaturaGrado,
  IAsignaturaPersonalizadaGrupo,
  IEvaluacionArea,
  IGradoPlan,
  IPersonalizacionGrupo,
  IPonderacionAsignatura,
  StudyPlanDocument,
} from './studyPlan.model';
import Subject, { SubjectDocument } from './subject.model';
import { MetodoCalculoEvaluacion, NivelEducativo } from '../../../constants/enums';
import ApiError from '../../../utils/ApiError';
import { registrarEvento } from '../../../services/audit.service';
import { getLimitesHorasPlan } from '../../institucional';
import { horasSemanalesDelGrupo } from './horasPlanEstudios';
import {
  AlcancePlan,
  areasDeAsignaturas,
  exigirAreasSinActividades,
  exigirMotivoSiAnioEnCurso,
  exigirSinAsignacionesActivas,
  sincronizarHorasDeAsignaciones,
} from './planEstudiosDependencias.service';

// Los subdocumentos tipan sus *_id como Types.ObjectId; los inputs del
// servicio llegan como string (ya validados como ObjectId por Joi) y Mongoose
// los castea igual al guardar — este helper solo satisface a TypeScript.
const oid = (id: string): Types.ObjectId => id as unknown as Types.ObjectId;

export interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

// Un año CERRADO es historico: su plan no se toca. Con el año en PLANIFICACION el plan se edita libremente;
// con el año EN_CURSO se edita con motivo, pero solo lo que no tiene resultados calculados encima (ver
// planEstudiosDependencias.service.ts): generateReportCard (M12) lee el plan en vivo al armar cada boletin.
function asegurarPlanEditable(academicYear: { year: number; estado: string }): void {
  if (academicYear.estado === 'CERRADO') {
    throw new ApiError(
      409,
      `El año lectivo ${academicYear.year} está cerrado: su plan de estudios es histórico y no se modifica.`
    );
  }
}

// Copiar el plan del año anterior solo tiene sentido como punto de partida de un año aun en preparacion.
function asegurarAnioEnPlanificacion(academicYear: { year: number; estado: string }): void {
  if (academicYear.estado !== 'PLANIFICACION') {
    throw new ApiError(
      409,
      `El año lectivo ${academicYear.year} ya fue activado: el plan solo se puede copiar a un año en planificación.`
    );
  }
}

interface PlanEnEdicion {
  plan: StudyPlanDocument;
  anio: AcademicYearDocument;
}

async function obtenerOCrearStudyPlan(institucion_id: string, academic_year_id: string): Promise<PlanEnEdicion> {
  const anio = await AcademicYear.findById(academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (String(anio.institucion_id) !== String(institucion_id)) {
    throw new ApiError(400, 'institucion_id no coincide con la institucion del año lectivo seleccionado.');
  }
  asegurarPlanEditable(anio);

  const existente = await StudyPlan.findOne({ institucion_id, academic_year_id });
  return { plan: existente ?? new StudyPlan({ institucion_id, academic_year_id, grades: [] }), anio };
}

function detalleDelCambio(base: string, motivo: string | undefined, asignacionesActualizadas: number): string {
  return (
    base +
    (asignacionesActualizadas > 0 ? ` ${asignacionesActualizadas} asignación(es) docente(s) con horas actualizadas.` : '') +
    (motivo ? ` Motivo: ${motivo}` : '')
  );
}

/**
 * Cambiar las asignaturas de un grado (o de un grupo, con `agregadas`): quitar una exige que no tenga
 * docente asignado, y con el año EN_CURSO agregar o quitar exige que su área no tenga actividades.
 */
async function validarCambioDeMalla(
  anio: AcademicYearDocument,
  alcance: AlcancePlan,
  previas: Set<string>,
  nuevas: Set<string>
): Promise<void> {
  const quitadas = [...previas].filter((id) => !nuevas.has(id));
  const agregadas = [...nuevas].filter((id) => !previas.has(id));

  await exigirSinAsignacionesActivas(String(anio._id), alcance, quitadas);
  if (anio.estado === 'EN_CURSO') {
    await exigirAreasSinActividades(String(anio._id), alcance, await areasDeAsignaturas([...quitadas, ...agregadas]));
  }
}

async function validarSubjectsDelNivel(
  subjectIds: string[],
  nivelDelGrado: NivelEducativo
): Promise<Map<string, SubjectDocument>> {
  const subjects = await Subject.find({ _id: { $in: subjectIds } });
  if (subjects.length !== new Set(subjectIds).size) {
    throw new ApiError(400, 'Una o mas asignaturas (subject_id) no existen.');
  }
  for (const subject of subjects) {
    if (subject.estado !== 'activo') {
      throw new ApiError(400, `La asignatura "${subject.nombre}" esta inactiva en el Catalogo Academico.`);
    }
    if (!subject.niveles_educativos.includes(nivelDelGrado)) {
      throw new ApiError(
        400,
        `La asignatura "${subject.nombre}" no esta habilitada para el nivel educativo de este grado. ` +
          'Debe habilitarse primero desde el Catalogo Academico (Gestion de Asignaturas).'
      );
    }
  }
  return new Map(subjects.map((s) => [String(s._id), s]));
}

/**
 * Cuando el metodo de calculo de un area es PONDERADO, la ponderacion debe cubrir TODAS las
 * asignaturas de esa area que esten en la Configuracion General del grado: una asignatura del area
 * que quede fuera de la ponderacion recibe `porcentaje ?? 0` en generateReportCard (M12) y su nota
 * cuenta 0% en silencio. Se valida tanto al guardar la ponderacion (configurarEvaluacionArea) como
 * al cambiar las asignaturas del grado (configurarAsignaturasGrado/-MultiplesGrados), porque agregar
 * una asignatura nueva a un area ya ponderada rompe la cobertura sin que nada lo marque.
 */
async function validarCoberturaPonderaciones(grado: IGradoPlan): Promise<void> {
  const ponderadas = grado.evaluaciones_area.filter((e) => e.metodo_calculo === 'PONDERADO');
  if (ponderadas.length === 0) return;

  const subjectIds = grado.asignaturas.map((a) => String(a.subject_id));
  const subjects = await Subject.find({ _id: { $in: subjectIds } }).select('area_id nombre');
  const areaPorSubject = new Map(subjects.map((s) => [String(s._id), String(s.area_id)]));
  const nombrePorSubject = new Map(subjects.map((s) => [String(s._id), s.nombre]));

  for (const evaluacion of ponderadas) {
    const subjectsDelAreaEnGrado = subjectIds.filter((id) => areaPorSubject.get(id) === String(evaluacion.area_id));
    const subjectsPonderados = new Set(evaluacion.asignaturas.map((a) => String(a.subject_id)));
    const faltante = subjectsDelAreaEnGrado.find((id) => !subjectsPonderados.has(id));
    if (faltante) {
      throw new ApiError(
        409,
        `La asignatura "${nombrePorSubject.get(faltante) ?? faltante}" quedaría sin porcentaje en la ponderación ` +
          'ya configurada para su área en este grado. Ajusta la ponderación del área desde Configuración de ' +
          'Evaluación antes (o después) de este cambio.'
      );
    }
  }
}

/**
 * El tope de horas semanales por nivel es configuración institucional y se exige aquí, no solo en la
 * pantalla: una llamada directa a la API no debe poder guardar un grado (ni un grupo) que lo exceda.
 * Al cambiar la base de un grado también se revisan sus grupos personalizados, que heredan esas horas.
 */
async function exigirTopeDeHoras(grado: IGradoPlan, grade: { nombre: string; nivel: NivelEducativo }): Promise<void> {
  const tope = (await getLimitesHorasPlan())[grade.nivel];

  const totalGrado = horasSemanalesDelGrupo(grado);
  if (totalGrado > tope) {
    throw new ApiError(
      400,
      `El grado "${grade.nombre}" suma ${totalGrado} h semanales y el tope configurado para el nivel ${grade.nivel} es ${tope} h.`
    );
  }

  for (const personalizacion of grado.personalizaciones_grupo) {
    const totalGrupo = horasSemanalesDelGrupo(grado, personalizacion);
    if (totalGrupo > tope) {
      const grupo = await Group.findById(personalizacion.group_id).select('nomenclatura');
      throw new ApiError(
        400,
        `Con este cambio el grupo ${grupo?.nomenclatura ?? personalizacion.group_id} del grado "${grade.nombre}" ` +
          `sumaría ${totalGrupo} h semanales y el tope del nivel ${grade.nivel} es ${tope} h. Ajusta su distribución primero.`
      );
    }
  }
}

function obtenerOCrearGrado(plan: StudyPlanDocument, grade_id: string): IGradoPlan {
  let grado = plan.grades.find((g) => String(g.grade_id) === grade_id);
  if (!grado) {
    grado = { grade_id: oid(grade_id), asignaturas: [], evaluaciones_area: [], personalizaciones_grupo: [] };
    plan.grades.push(grado);
  }
  return grado;
}

// ---------------------------------------------------------------------------
// 2.1 Configuracion General: asignaturas e intensidad horaria de un grado.
// ---------------------------------------------------------------------------

export interface AsignaturaGradoInput {
  subject_id: string;
  intensidad_horaria_semanal: number;
}

export interface ConfigurarAsignaturasGradoInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  asignaturas: AsignaturaGradoInput[];
  motivo?: string;
}

/**
 * Reemplaza por completo la Configuracion General (asignaturas + intensidad
 * horaria) de un grado para el año lectivo dado. Es un "set" idempotente, no
 * un "append": la solicitud debe incluir TODAS las asignaturas que se quieran
 * dejar configuradas para ese grado.
 */
export async function configurarAsignaturasGrado(
  input: ConfigurarAsignaturasGradoInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudyPlanDocument> {
  const grade = await Grade.findById(input.grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');
  if (grade.estado !== 'activo') throw new ApiError(400, 'El grado esta inactivo.');

  const subjectIds = input.asignaturas.map((a) => a.subject_id);
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new ApiError(400, 'No se puede repetir la misma asignatura en la Configuracion General de un grado.');
  }
  if (subjectIds.length > 0) {
    await validarSubjectsDelNivel(subjectIds, grade.nivel);
  }

  const { plan, anio } = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const motivo = exigirMotivoSiAnioEnCurso(anio, input.motivo);
  const grado = obtenerOCrearGrado(plan, input.grade_id);
  const previas = new Set(grado.asignaturas.map((a) => String(a.subject_id)));
  grado.asignaturas = input.asignaturas.map(
    (a): IAsignaturaGrado => ({
      subject_id: oid(a.subject_id),
      intensidad_horaria_semanal: a.intensidad_horaria_semanal,
    })
  );
  await validarCambioDeMalla(anio, { grade_id: input.grade_id }, previas, new Set(subjectIds));
  await exigirTopeDeHoras(grado, grade);
  await validarCoberturaPonderaciones(grado);

  await plan.save();
  const sincronizadas = await sincronizarHorasDeAsignaciones(plan, [input.grade_id]);

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLAN_ASIGNATURAS_GRADO_ACTUALIZADO',
    entidad: 'StudyPlan',
    entidad_id: plan._id,
    detalle: detalleDelCambio(
      `Grado "${grade.nombre}": ${grado.asignaturas.length} asignatura(s) configurada(s).`,
      motivo,
      sincronizadas
    ),
    ip,
  });
  return plan;
}

export interface ConfigurarAsignaturasGradosItemInput {
  grade_id: string;
  asignaturas: AsignaturaGradoInput[];
}

export interface ConfigurarAsignaturasMultiplesGradosInput {
  institucion_id: string;
  academic_year_id: string;
  grados: ConfigurarAsignaturasGradosItemInput[];
  motivo?: string;
}

/**
 * Configura las asignaturas e intensidades horarias para múltiples grados en una sola operación atómica.
 */
export async function configurarAsignaturasMultiplesGrados(
  input: ConfigurarAsignaturasMultiplesGradosInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudyPlanDocument> {
  const gradeIdsSolicitados = input.grados.map((g) => g.grade_id);
  if (new Set(gradeIdsSolicitados).size !== gradeIdsSolicitados.length) {
    throw new ApiError(400, 'No se puede repetir el mismo grado en una misma solicitud de configuración masiva.');
  }

  const gradePorId = new Map<string, GradeDocument>();
  for (const item of input.grados) {
    const grade = await Grade.findById(item.grade_id);
    if (!grade) throw new ApiError(404, `Grado no encontrado: ${item.grade_id}.`);
    gradePorId.set(item.grade_id, grade);
    if (grade.estado !== 'activo') throw new ApiError(400, `El grado "${grade.nombre}" está inactivo.`);

    const subjectIds = item.asignaturas.map((a) => a.subject_id);
    if (new Set(subjectIds).size !== subjectIds.length) {
      throw new ApiError(
        400,
        `No se puede repetir la misma asignatura en la Configuración General del grado "${grade.nombre}".`
      );
    }
    if (subjectIds.length > 0) {
      await validarSubjectsDelNivel(subjectIds, grade.nivel);
    }
  }

  const { plan, anio } = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const motivo = exigirMotivoSiAnioEnCurso(anio, input.motivo);
  for (const item of input.grados) {
    const grado = obtenerOCrearGrado(plan, item.grade_id);
    const previas = new Set(grado.asignaturas.map((a) => String(a.subject_id)));
    grado.asignaturas = item.asignaturas.map(
      (a): IAsignaturaGrado => ({
        subject_id: oid(a.subject_id),
        intensidad_horaria_semanal: a.intensidad_horaria_semanal,
      })
    );
    await validarCambioDeMalla(
      anio,
      { grade_id: item.grade_id },
      previas,
      new Set(item.asignaturas.map((a) => a.subject_id))
    );
    await exigirTopeDeHoras(grado, gradePorId.get(item.grade_id) as GradeDocument);
    await validarCoberturaPonderaciones(grado);
  }

  await plan.save();
  const sincronizadas = await sincronizarHorasDeAsignaciones(plan, gradeIdsSolicitados);

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLAN_ASIGNATURAS_GRADO_ACTUALIZADO',
    entidad: 'StudyPlan',
    entidad_id: plan._id,
    detalle: detalleDelCambio(
      `Configuración General actualizada para ${input.grados.length} grado(s).`,
      motivo,
      sincronizadas
    ),
    ip,
  });
  return plan;
}

// ---------------------------------------------------------------------------
// 2.3 Configuracion de Evaluacion: metodo de calculo y ponderacion por area.
// ---------------------------------------------------------------------------

export interface PonderacionAsignaturaInput {
  subject_id: string;
  porcentaje: number;
}

export interface ConfigurarEvaluacionAreaInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  area_id: string;
  metodo_calculo: MetodoCalculoEvaluacion;
  // Solo se exige (y se valida que sume 100%) cuando metodo_calculo es PONDERADO.
  asignaturas: PonderacionAsignaturaInput[];
  motivo?: string;
}

export async function configurarEvaluacionArea(
  input: ConfigurarEvaluacionAreaInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudyPlanDocument> {
  const area = await Area.findById(input.area_id);
  if (!area) throw new ApiError(404, 'Area no encontrada.');

  const { plan, anio } = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const motivo = exigirMotivoSiAnioEnCurso(anio, input.motivo);
  const grado = plan.grades.find((g) => String(g.grade_id) === input.grade_id);
  if (!grado) {
    throw new ApiError(
      400,
      'Este grado no tiene Configuracion General definida todavia. Configure primero las asignaturas del grado.'
    );
  }
  if (anio.estado === 'EN_CURSO') {
    await exigirAreasSinActividades(String(anio._id), { grade_id: input.grade_id }, [input.area_id]);
  }

  const subjectIdsDelGrado = new Set(grado.asignaturas.map((a) => String(a.subject_id)));

  if (input.metodo_calculo === 'PONDERADO') {
    const subjectIds = input.asignaturas.map((a) => a.subject_id);
    if (new Set(subjectIds).size !== subjectIds.length) {
      throw new ApiError(400, 'No se puede repetir una asignatura en la ponderacion de un area.');
    }
    const subjects = await Subject.find({ _id: { $in: subjectIds } });
    const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
    for (const item of input.asignaturas) {
      const subject = subjectById.get(item.subject_id);
      if (!subject) throw new ApiError(400, `La asignatura ${item.subject_id} no existe.`);
      if (String(subject.area_id) !== input.area_id) {
        throw new ApiError(400, `La asignatura "${subject.nombre}" no pertenece al area seleccionada.`);
      }
      if (!subjectIdsDelGrado.has(item.subject_id)) {
        throw new ApiError(
          400,
          `La asignatura "${subject.nombre}" no esta en la Configuracion General de este grado.`
        );
      }
    }

    // La ponderacion debe cubrir TODAS las asignaturas del area que ya esten en este grado: una
    // que quede fuera recibiria 0% de forma silenciosa al generar boletines (ver
    // validarCoberturaPonderaciones).
    const subjectsDelAreaEnGrado = await Subject.find({
      _id: { $in: [...subjectIdsDelGrado] },
      area_id: input.area_id,
    }).select('_id nombre');
    const idsPonderados = new Set(input.asignaturas.map((a) => a.subject_id));
    const faltante = subjectsDelAreaEnGrado.find((s) => !idsPonderados.has(String(s._id)));
    if (faltante) {
      throw new ApiError(
        400,
        `La ponderación debe incluir todas las asignaturas del área que ya están en este grado; falta "${faltante.nombre}".`
      );
    }
  }

  const nuevaEvaluacion: IEvaluacionArea = {
    area_id: oid(input.area_id),
    metodo_calculo: input.metodo_calculo,
    asignaturas: input.asignaturas.map(
      (a): IPonderacionAsignatura => ({
        subject_id: oid(a.subject_id),
        porcentaje: a.porcentaje,
      })
    ),
  };

  const idx = grado.evaluaciones_area.findIndex((e) => String(e.area_id) === input.area_id);
  if (idx >= 0) grado.evaluaciones_area[idx] = nuevaEvaluacion;
  else grado.evaluaciones_area.push(nuevaEvaluacion);

  await plan.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLAN_EVALUACION_AREA_ACTUALIZADA',
    entidad: 'StudyPlan',
    entidad_id: plan._id,
    detalle: detalleDelCambio(`Área "${area.nombre}": método ${input.metodo_calculo}.`, motivo, 0),
    ip,
  });
  return plan;
}

// ---------------------------------------------------------------------------
// 2.2 Distribucion por Grupos: personalizacion de un grupo sobre su grado.
// ---------------------------------------------------------------------------

export interface AsignaturaPersonalizadaInput {
  subject_id: string;
  intensidad_horaria_semanal: number;
  observacion: string;
}

export interface ConfigurarDistribucionGrupoInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  group_id: string;
  intensidades_personalizadas: AsignaturaPersonalizadaInput[];
  asignaturas_agregadas: AsignaturaPersonalizadaInput[];
  motivo?: string;
}

export async function configurarDistribucionGrupo(
  input: ConfigurarDistribucionGrupoInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudyPlanDocument> {
  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(group.grade_id) !== input.grade_id) {
    throw new ApiError(400, 'El grupo no pertenece al grado seleccionado.');
  }
  if (String(group.academic_year_id) !== input.academic_year_id) {
    throw new ApiError(400, 'El grupo no pertenece al año lectivo seleccionado.');
  }
  if (group.estado !== 'ACTIVE') {
    throw new ApiError(400, `El grupo ${group.nomenclatura} está cerrado: no admite cambios en su distribución.`);
  }

  const grade = await Grade.findById(input.grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');
  if (grade.estado !== 'activo') throw new ApiError(400, 'El grado está inactivo.');

  const { plan, anio } = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const motivo = exigirMotivoSiAnioEnCurso(anio, input.motivo);
  const grado = plan.grades.find((g) => String(g.grade_id) === input.grade_id);
  if (!grado) {
    throw new ApiError(
      400,
      'Este grado no tiene Configuracion General definida todavia. Configure primero las asignaturas del grado.'
    );
  }
  const subjectIdsDelGrado = new Set(grado.asignaturas.map((a) => String(a.subject_id)));

  const idsPersonalizados = input.intensidades_personalizadas.map((a) => a.subject_id);
  if (new Set(idsPersonalizados).size !== idsPersonalizados.length) {
    throw new ApiError(400, 'No se puede repetir una asignatura en las intensidades personalizadas.');
  }
  const faltaEnGrado = idsPersonalizados.find((id) => !subjectIdsDelGrado.has(id));
  if (faltaEnGrado) {
    throw new ApiError(
      400,
      'Solo se puede personalizar la intensidad horaria de una asignatura que ya este en la Configuracion General del grado.'
    );
  }

  const idsAgregados = input.asignaturas_agregadas.map((a) => a.subject_id);
  if (new Set(idsAgregados).size !== idsAgregados.length) {
    throw new ApiError(400, 'No se puede agregar dos veces la misma asignatura especifica a un grupo.');
  }
  const yaEstaEnElGrado = idsAgregados.find((id) => subjectIdsDelGrado.has(id));
  if (yaEstaEnElGrado) {
    throw new ApiError(
      400,
      'Una asignatura especifica agregada a un grupo no puede ser una que el grado ya tenga en su Configuracion General.'
    );
  }
  // "La asignatura no fue relacionada con el Nivel academico de este grado" (Analisis_M06_Klassy).
  const subjectsAgregados = await validarSubjectsDelNivel(idsAgregados, grade.nivel);

  // RN-EVAL-02: una asignatura agregada cuya area ya tiene ponderacion fija en el grado quedaria
  // sin porcentaje asignado en el boletin de este grupo (evaluaciones_area_personalizadas todavia
  // no tiene una operacion propia que la complete — ver comentario mas abajo). Se bloquea en vez
  // de dejarla contar 0% en silencio.
  const areasPonderadasDelGrado = new Set(
    grado.evaluaciones_area.filter((e) => e.metodo_calculo === 'PONDERADO').map((e) => String(e.area_id))
  );
  for (const id of idsAgregados) {
    const subject = subjectsAgregados.get(id);
    if (subject && areasPonderadasDelGrado.has(String(subject.area_id))) {
      throw new ApiError(
        409,
        `La asignatura "${subject.nombre}" pertenece a un área con ponderación fija (%) en este grado: agregarla ` +
          'a este grupo la dejaría sin porcentaje en el boletín. Ajusta la ponderación del área desde ' +
          'Configuración de Evaluación antes de agregarla a un grupo específico.'
      );
    }
  }

  const mapear = (items: AsignaturaPersonalizadaInput[]): IAsignaturaPersonalizadaGrupo[] =>
    items.map((a) => ({
      subject_id: oid(a.subject_id),
      intensidad_horaria_semanal: a.intensidad_horaria_semanal,
      observacion: a.observacion,
    }));

  const idx = grado.personalizaciones_grupo.findIndex((p) => String(p.group_id) === input.group_id);
  const personalizacionExistente = idx >= 0 ? grado.personalizaciones_grupo[idx] : null;

  await validarCambioDeMalla(
    anio,
    { group_id: input.group_id },
    new Set((personalizacionExistente?.asignaturas_agregadas ?? []).map((a) => String(a.subject_id))),
    new Set(idsAgregados)
  );

  const nuevaPersonalizacion: IPersonalizacionGrupo = {
    group_id: oid(input.group_id),
    intensidades_personalizadas: mapear(input.intensidades_personalizadas),
    asignaturas_agregadas: mapear(input.asignaturas_agregadas),
    // La evaluacion de area personalizada (RN-EVAL-02) se gestiona con su
    // propia operacion cuando la composicion del area cambie para el grupo;
    // aqui se preserva la que ya existiera.
    evaluaciones_area_personalizadas: personalizacionExistente?.evaluaciones_area_personalizadas ?? [],
  };

  const topeDelNivel = (await getLimitesHorasPlan())[grade.nivel];
  const totalGrupo = horasSemanalesDelGrupo(grado, nuevaPersonalizacion);
  if (totalGrupo > topeDelNivel) {
    throw new ApiError(
      400,
      `El grupo ${group.nomenclatura} sumaría ${totalGrupo} h semanales y el tope configurado para el nivel ${grade.nivel} es ${topeDelNivel} h.`
    );
  }

  if (idx >= 0) grado.personalizaciones_grupo[idx] = nuevaPersonalizacion;
  else grado.personalizaciones_grupo.push(nuevaPersonalizacion);

  await plan.save();
  const sincronizadas = await sincronizarHorasDeAsignaciones(plan, [input.grade_id]);

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLAN_DISTRIBUCION_GRUPO_ACTUALIZADA',
    entidad: 'StudyPlan',
    entidad_id: plan._id,
    detalle: detalleDelCambio(
      `Grupo ${group.nomenclatura}: ${nuevaPersonalizacion.intensidades_personalizadas.length} intensidad(es) ` +
        `personalizada(s), ${nuevaPersonalizacion.asignaturas_agregadas.length} asignatura(s) agregada(s).`,
      motivo,
      sincronizadas
    ),
    ip,
  });
  return plan;
}

// ---------------------------------------------------------------------------
// "Crear a partir del plan del año anterior": copia la malla de un año
// lectivo ya configurado como punto de partida de uno nuevo.
// ---------------------------------------------------------------------------

export interface CrearPlanDesdeAnioAnteriorInput {
  institucion_id: string;
  academic_year_id: string;
  academic_year_id_anterior: string;
}

/**
 * Copia la Configuracion General y la Configuracion de Evaluacion del plan de
 * un año lectivo anterior hacia uno nuevo, como punto de partida editable.
 *
 * La Distribucion por Grupos NO se copia: cada `group_id` pertenece a un
 * `Group` que es unico por `academic_year_id` (ver group.model.ts), asi que
 * los grupos del año anterior no existen en el año nuevo. Los grupos del
 * nuevo año heredan automaticamente la Configuracion General de su grado
 * (regla de oro de herencia del Analisis_M06_Klassy); si alguno necesita su
 * propia distribucion, se configura de nuevo con configurarDistribucionGrupo.
 */
export async function crearPlanDesdeAnioAnterior(
  input: CrearPlanDesdeAnioAnteriorInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudyPlanDocument> {
  const academicYearNuevo = await AcademicYear.findById(input.academic_year_id);
  if (!academicYearNuevo) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (String(academicYearNuevo.institucion_id) !== input.institucion_id) {
    throw new ApiError(400, 'institucion_id no coincide con la institucion del año lectivo seleccionado.');
  }
  asegurarAnioEnPlanificacion(academicYearNuevo);

  const academicYearAnterior = await AcademicYear.findById(input.academic_year_id_anterior);
  if (!academicYearAnterior) throw new ApiError(404, 'El año lectivo anterior seleccionado no existe.');
  if (academicYearAnterior.year >= academicYearNuevo.year) {
    throw new ApiError(
      400,
      `El año lectivo ${academicYearAnterior.year} no es anterior a ${academicYearNuevo.year}: elige un año lectivo previo del cual copiar.`
    );
  }

  const yaExiste = await StudyPlan.findOne({
    institucion_id: input.institucion_id,
    academic_year_id: input.academic_year_id,
  });
  if (yaExiste) {
    throw new ApiError(409, 'Ya existe un plan de estudios configurado para este año lectivo.');
  }

  const planAnterior = await StudyPlan.findOne({
    institucion_id: input.institucion_id,
    academic_year_id: input.academic_year_id_anterior,
  });
  if (!planAnterior) {
    throw new ApiError(404, 'No hay un plan de estudios configurado para el año lectivo anterior seleccionado.');
  }

  // El plan anterior puede referenciar grados que ya se inactivaron o asignaturas que ya no
  // existen, quedaron inactivas o dejaron de ofrecerse en ese nivel: se revalidan igual que
  // cualquier otra escritura del plan (validarSubjectsDelNivel) en vez de arrastrarlas sin mas.
  const todosLosSubjectIds = [...new Set(planAnterior.grades.flatMap((g) => g.asignaturas.map((a) => String(a.subject_id))))];
  const subjects = await Subject.find({ _id: { $in: todosLosSubjectIds } });
  const subjectPorId = new Map(subjects.map((s) => [String(s._id), s]));
  const gradeIds = [...new Set(planAnterior.grades.map((g) => String(g.grade_id)))];
  const grades = await Grade.find({ _id: { $in: gradeIds } });
  const gradePorId = new Map(grades.map((g) => [String(g._id), g]));

  const gradosCopiados: IGradoPlan[] = [];
  for (const grado of planAnterior.grades) {
    const grade = gradePorId.get(String(grado.grade_id));
    if (!grade || grade.estado !== 'activo') continue;

    const subjectIdsValidos = new Set(
      grado.asignaturas
        .map((a) => String(a.subject_id))
        .filter((id) => {
          const subject = subjectPorId.get(id);
          return Boolean(subject) && subject!.estado === 'activo' && subject!.niveles_educativos.includes(grade.nivel);
        })
    );

    const asignaturas = grado.asignaturas
      .filter((a) => subjectIdsValidos.has(String(a.subject_id)))
      .map((a) => ({ subject_id: a.subject_id, intensidad_horaria_semanal: a.intensidad_horaria_semanal }));

    // Una ponderacion solo sobrevive la copia si TODAS sus asignaturas siguen vigentes (si alguna
    // se filtro, la ponderacion ya no es valida: ni su suma ni su cobertura del area se sostienen).
    // El grado queda igual como punto de partida editable; se reconfigura desde Evaluacion.
    const evaluaciones_area = grado.evaluaciones_area
      .filter((e) => e.asignaturas.every((a) => subjectIdsValidos.has(String(a.subject_id))))
      .map((e) => ({
        area_id: e.area_id,
        metodo_calculo: e.metodo_calculo,
        asignaturas: e.asignaturas.map((a) => ({ subject_id: a.subject_id, porcentaje: a.porcentaje })),
      }));

    gradosCopiados.push({ grade_id: grado.grade_id, asignaturas, evaluaciones_area, personalizaciones_grupo: [] });
  }

  const nuevoPlan = new StudyPlan({
    institucion_id: input.institucion_id,
    academic_year_id: input.academic_year_id,
    grades: gradosCopiados,
  });

  await nuevoPlan.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLAN_CREADO_DESDE_ANIO_ANTERIOR',
    entidad: 'StudyPlan',
    entidad_id: nuevoPlan._id,
    detalle: `Año ${academicYearNuevo.year} copiado desde el plan del año lectivo ${input.academic_year_id_anterior}.`,
    ip,
  });
  return nuevoPlan;
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export interface ObtenerStudyPlanInput {
  institucion_id: string;
  academic_year_id: string;
}

export async function obtenerStudyPlan(input: ObtenerStudyPlanInput): Promise<StudyPlanDocument | null> {
  return StudyPlan.findOne({ institucion_id: input.institucion_id, academic_year_id: input.academic_year_id });
}

export interface GradoExcedido {
  anio: number;
  grado: string;
  /** Null cuando el exceso es de la configuración general del grado, no de un grupo. */
  grupo: string | null;
  horas: number;
  tope: number;
}

/**
 * Grados (o grupos) de los planes de años no cerrados cuyas horas semanales superan el tope vigente de su
 * nivel. Los años cerrados son historia y no se corrigen, por eso no cuentan.
 */
export async function gradosQueExcedenElTope(): Promise<GradoExcedido[]> {
  const limites = await getLimitesHorasPlan();
  const anios = await AcademicYear.find({ estado: { $ne: 'CERRADO' } }).select('year');
  if (anios.length === 0) return [];

  const planes = await StudyPlan.find({ academic_year_id: { $in: anios.map((a) => a._id) } });
  const anioPorId = new Map(anios.map((a) => [String(a._id), a.year]));
  const grades = await Grade.find({ _id: { $in: planes.flatMap((p) => p.grades.map((g) => g.grade_id)) } }).select('nombre nivel');
  const gradePorId = new Map(grades.map((g) => [String(g._id), g]));
  const grupos = await Group.find({
    _id: { $in: planes.flatMap((p) => p.grades.flatMap((g) => g.personalizaciones_grupo.map((x) => x.group_id))) },
  }).select('nomenclatura');
  const nomenclaturaPorId = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  const excedidos: GradoExcedido[] = [];
  for (const plan of planes) {
    const anio = anioPorId.get(String(plan.academic_year_id)) ?? 0;
    for (const grado of plan.grades) {
      const grade = gradePorId.get(String(grado.grade_id));
      if (!grade) continue;
      const tope = limites[grade.nivel];

      const horasGrado = horasSemanalesDelGrupo(grado);
      if (horasGrado > tope) excedidos.push({ anio, grado: grade.nombre, grupo: null, horas: horasGrado, tope });

      for (const personalizacion of grado.personalizaciones_grupo) {
        const horasGrupo = horasSemanalesDelGrupo(grado, personalizacion);
        if (horasGrupo > tope) {
          const grupo = nomenclaturaPorId.get(String(personalizacion.group_id)) ?? null;
          excedidos.push({ anio, grado: grade.nombre, grupo, horas: horasGrupo, tope });
        }
      }
    }
  }
  return excedidos.sort((a, b) => a.anio - b.anio || a.grado.localeCompare(b.grado));
}
