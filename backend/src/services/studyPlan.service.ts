import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import StudyPlan, {
  IAsignaturaGrado,
  IAsignaturaPersonalizadaGrupo,
  IEvaluacionArea,
  IGradoPlan,
  IPersonalizacionGrupo,
  IPonderacionAsignatura,
  StudyPlanDocument,
} from '../models/studyPlan.model';
import Subject, { SubjectDocument } from '../models/subject.model';
import { MetodoCalculoEvaluacion, NivelEducativo } from '../constants/enums';
import ApiError from '../utils/ApiError';

// Los subdocumentos tipan sus *_id como Types.ObjectId; los inputs del
// servicio llegan como string (ya validados como ObjectId por Joi) y Mongoose
// los castea igual al guardar — este helper solo satisface a TypeScript.
const oid = (id: string): Types.ObjectId => id as unknown as Types.ObjectId;

async function obtenerOCrearStudyPlan(institucion_id: string, academic_year_id: string): Promise<StudyPlanDocument> {
  const academicYear = await AcademicYear.findById(academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (String(academicYear.institucion_id) !== String(institucion_id)) {
    throw new ApiError(400, 'institucion_id no coincide con la institucion del año lectivo seleccionado.');
  }

  const existente = await StudyPlan.findOne({ institucion_id, academic_year_id });
  return existente ?? new StudyPlan({ institucion_id, academic_year_id, grades: [] });
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
}

/**
 * Reemplaza por completo la Configuracion General (asignaturas + intensidad
 * horaria) de un grado para el año lectivo dado. Es un "set" idempotente, no
 * un "append": la solicitud debe incluir TODAS las asignaturas que se quieran
 * dejar configuradas para ese grado.
 */
export async function configurarAsignaturasGrado(input: ConfigurarAsignaturasGradoInput): Promise<StudyPlanDocument> {
  const grade = await Grade.findById(input.grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');
  if (grade.estado !== 'activo') throw new ApiError(400, 'El grado esta inactivo.');

  const subjectIds = input.asignaturas.map((a) => a.subject_id);
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new ApiError(400, 'No se puede repetir la misma asignatura en la Configuracion General de un grado.');
  }
  await validarSubjectsDelNivel(subjectIds, grade.nivel);

  const plan = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const grado = obtenerOCrearGrado(plan, input.grade_id);
  grado.asignaturas = input.asignaturas.map(
    (a): IAsignaturaGrado => ({
      subject_id: oid(a.subject_id),
      intensidad_horaria_semanal: a.intensidad_horaria_semanal,
    })
  );

  await plan.save();
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
}

export async function configurarEvaluacionArea(input: ConfigurarEvaluacionAreaInput): Promise<StudyPlanDocument> {
  const area = await Area.findById(input.area_id);
  if (!area) throw new ApiError(404, 'Area no encontrada.');

  const plan = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
  const grado = plan.grades.find((g) => String(g.grade_id) === input.grade_id);
  if (!grado) {
    throw new ApiError(
      400,
      'Este grado no tiene Configuracion General definida todavia. Configure primero las asignaturas del grado.'
    );
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
}

export async function configurarDistribucionGrupo(input: ConfigurarDistribucionGrupoInput): Promise<StudyPlanDocument> {
  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(group.grade_id) !== input.grade_id) {
    throw new ApiError(400, 'El grupo no pertenece al grado seleccionado.');
  }
  if (String(group.academic_year_id) !== input.academic_year_id) {
    throw new ApiError(400, 'El grupo no pertenece al año lectivo seleccionado.');
  }

  const grade = await Grade.findById(input.grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');

  const plan = await obtenerOCrearStudyPlan(input.institucion_id, input.academic_year_id);
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
  await validarSubjectsDelNivel(idsAgregados, grade.nivel);

  const mapear = (items: AsignaturaPersonalizadaInput[]): IAsignaturaPersonalizadaGrupo[] =>
    items.map((a) => ({
      subject_id: oid(a.subject_id),
      intensidad_horaria_semanal: a.intensidad_horaria_semanal,
      observacion: a.observacion,
    }));

  const idx = grado.personalizaciones_grupo.findIndex((p) => String(p.group_id) === input.group_id);
  const personalizacionExistente = idx >= 0 ? grado.personalizaciones_grupo[idx] : null;

  const nuevaPersonalizacion: IPersonalizacionGrupo = {
    group_id: oid(input.group_id),
    intensidades_personalizadas: mapear(input.intensidades_personalizadas),
    asignaturas_agregadas: mapear(input.asignaturas_agregadas),
    // La evaluacion de area personalizada (RN-EVAL-02) se gestiona con su
    // propia operacion cuando la composicion del area cambie para el grupo;
    // aqui se preserva la que ya existiera.
    evaluaciones_area_personalizadas: personalizacionExistente?.evaluaciones_area_personalizadas ?? [],
  };

  if (idx >= 0) grado.personalizaciones_grupo[idx] = nuevaPersonalizacion;
  else grado.personalizaciones_grupo.push(nuevaPersonalizacion);

  await plan.save();
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
export async function crearPlanDesdeAnioAnterior(input: CrearPlanDesdeAnioAnteriorInput): Promise<StudyPlanDocument> {
  const academicYearNuevo = await AcademicYear.findById(input.academic_year_id);
  if (!academicYearNuevo) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (String(academicYearNuevo.institucion_id) !== input.institucion_id) {
    throw new ApiError(400, 'institucion_id no coincide con la institucion del año lectivo seleccionado.');
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

  const nuevoPlan = new StudyPlan({
    institucion_id: input.institucion_id,
    academic_year_id: input.academic_year_id,
    grades: planAnterior.grades.map(
      (grado): IGradoPlan => ({
        grade_id: grado.grade_id,
        asignaturas: grado.asignaturas.map((a) => ({
          subject_id: a.subject_id,
          intensidad_horaria_semanal: a.intensidad_horaria_semanal,
        })),
        evaluaciones_area: grado.evaluaciones_area.map((e) => ({
          area_id: e.area_id,
          metodo_calculo: e.metodo_calculo,
          asignaturas: e.asignaturas.map((a) => ({ subject_id: a.subject_id, porcentaje: a.porcentaje })),
        })),
        personalizaciones_grupo: [],
      })
    ),
  });

  await nuevoPlan.save();
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
