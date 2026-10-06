import { Types } from 'mongoose';
import { CategoriaAjuste, EfectividadAjuste, TipoBarrera } from './inclusion.constants';
import { ROLES } from '../../../constants/roles';
import AcademicYear from '../../../models/academicYear.model';
import AjusteAsignatura, { AjusteAsignaturaDocument } from './ajusteAsignatura.model';
import ReferenteCurricular from '../../../models/referenteCurricular.model';
import Subject from '../../../models/subject.model';
import { User, UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { ajusteCompleto } from './inclusion';
import { permisoInclusion } from './permisosInclusion';
import { registrarEvento } from '../../../services/audit.service';
import { cargarConPermiso, exigirEditable, guardarCambio } from './expedienteInclusion.service';
import { asignaturasEsperadas, comoUsuarioInclusion, docenteDictaAsignatura, noEncontrado, obtenerConfiguracion } from './inclusionContexto.service';

export interface GuardarAjusteInput {
  dba_ids?: string[];
  objetivo_flexibilizado?: string;
  barrera_asignatura?: string;
  tipos_barrera?: TipoBarrera[];
  ajuste_metodologico?: string;
  ajuste_evaluativo?: string;
  categorias_ajuste?: CategoriaAjuste[];
  recursos?: string;
}

const vistaAjuste = (a: AjusteAsignaturaDocument) => ({
  dba_ids: a.dba_ids.map(String),
  objetivo_flexibilizado: a.objetivo_flexibilizado,
  barrera_asignatura: a.barrera_asignatura,
  tipos_barrera: a.tipos_barrera,
  ajuste_metodologico: a.ajuste_metodologico,
  ajuste_evaluativo: a.ajuste_evaluativo,
  categorias_ajuste: a.categorias_ajuste,
  recursos: a.recursos,
  seguimientos: a.seguimientos.map((s) => ({
    _id: String(s._id),
    periodo_numero: s.periodo_numero,
    fecha: s.fecha,
    efectividad: s.efectividad,
    observacion: s.observacion,
    nueva_accion: s.nueva_accion,
    por: String(s.por),
  })),
  ultima_edicion: a.ediciones.at(-1) ?? null,
  completo: ajusteCompleto({
    dba_ids: a.dba_ids.map(String),
    objetivo_flexibilizado: a.objetivo_flexibilizado,
    barrera_asignatura: a.barrera_asignatura,
    ajuste_metodologico: a.ajuste_metodologico,
    ajuste_evaluativo: a.ajuste_evaluativo,
  }),
});

/**
 * Anexo 2: una fila por asignatura del plan de estudios del grupo. Quien ve todas (orientación, coordinación, ADMIN, director de
 * grupo) las recibe; el docente de clase solo las de las asignaturas que dicta (RN-16-05). Se lee con la ficha, nunca el clínico.
 */
export async function listarAjustes(expedienteId: string, usuario: UserDocument) {
  const { exp, ctx } = await cargarConPermiso(expedienteId, usuario, 'VER_FICHA_PEDAGOGICA');
  const verTodos = permisoInclusion(comoUsuarioInclusion(usuario), ctx.contexto, 'VER_TODOS_LOS_AJUSTES');
  const [esperadas, ajustes, configuracion] = await Promise.all([
    asignaturasEsperadas(ctx.grupo),
    AjusteAsignatura.find({ expediente_id: exp._id }),
    obtenerConfiguracion(),
  ]);
  const docentes = await User.find({ _id: { $in: esperadas.map((e) => e.docente_id).filter(Boolean) } }).select('nombre apellido');
  const nombreDocente = new Map(docentes.map((d) => [String(d._id), `${d.nombre} ${d.apellido}`]));
  const porAsignatura = new Map(ajustes.map((a) => [String(a.subject_id), a]));

  const filas = esperadas
    .filter((e) => verTodos || e.docente_id === String(usuario._id))
    .map((e) => {
      const ajuste = porAsignatura.get(e.subject_id);
      return {
        subject_id: e.subject_id,
        asignatura: e.nombre,
        area: e.area,
        area_id: e.area_id,
        docente: e.docente_id ? (nombreDocente.get(e.docente_id) ?? '') : null,
        es_mia: e.docente_id === String(usuario._id),
        puede_editar:
          exp.estado !== 'BORRADOR' &&
          exp.estado !== 'CERRADO' &&
          permisoInclusion(comoUsuarioInclusion(usuario), { ...ctx.contexto, dictaLaAsignatura: e.docente_id === String(usuario._id) }, 'EDITAR_AJUSTE'),
        ajuste: ajuste ? vistaAjuste(ajuste) : null,
      };
    });
  return { seguimientos_minimos: configuracion.seguimientos_minimos_anio, estado_expediente: exp.estado, grade_id: String(ctx.grupo.grade_id), filas };
}

async function validarReferentes(ids: string[], subjectId: string, gradeId: Types.ObjectId): Promise<void> {
  if (ids.length === 0) return;
  const asignatura = await Subject.findById(subjectId).select('area_id');
  const referentes = await ReferenteCurricular.find({ _id: { $in: ids } }).select('area_id tipo_referente grade_id');
  const validos = referentes.filter((r) => {
    if (String(r.area_id) !== String(asignatura?.area_id)) return false;
    // Un DBA es de un grado concreto; un EBC cubre un grupo de grados, así que solo se exige el área.
    return r.tipo_referente !== 'DBA' || String((r as unknown as { grade_id?: Types.ObjectId }).grade_id) === String(gradeId);
  });
  if (validos.length !== new Set(ids).size) throw new ApiError(400, 'Algún referente no existe o no corresponde al área de la asignatura y al grado del estudiante.');
}

/** El docente de la asignatura (o orientación/ADMIN) guarda su fila. Con el expediente ACTIVO sube la versión; con el aprobado lo devuelve a construcción. */
export async function guardarAjuste(expedienteId: string, subjectId: string, datos: GuardarAjusteInput, usuario: UserDocument, ip?: string | null) {
  const { exp, ctx } = await cargarConPermiso(expedienteId, usuario, 'VER_FICHA_PEDAGOGICA');
  const esperadas = await asignaturasEsperadas(ctx.grupo);
  if (!esperadas.some((e) => e.subject_id === subjectId)) throw noEncontrado('Asignatura');

  const dicta = usuario.rol === ROLES.DOCENTE && (await docenteDictaAsignatura(usuario._id, ctx.grupo._id, exp.academic_year_id, subjectId));
  if (!permisoInclusion(comoUsuarioInclusion(usuario), { ...ctx.contexto, dictaLaAsignatura: dicta }, 'EDITAR_AJUSTE')) {
    // El docente ve que la fila existe pero no es suya: 403, no 404 (ya tiene acceso al expediente).
    throw new ApiError(403, 'Solo el docente que dicta la asignatura (u orientación) puede editar este ajuste.');
  }
  await exigirEditable(exp);
  if (exp.estado === 'BORRADOR') throw new ApiError(409, 'Orientación debe iniciar la construcción del expediente antes de diligenciar los ajustes.');
  if (exp.tipo !== 'PIAR') throw new ApiError(409, 'Los ajustes por asignatura son del PIAR.');
  await validarReferentes(datos.dba_ids ?? [], subjectId, ctx.grupo.grade_id);

  const ajuste = (await AjusteAsignatura.findOne({ expediente_id: exp._id, subject_id: subjectId })) ?? new AjusteAsignatura({ expediente_id: exp._id, subject_id: subjectId });
  for (const campo of ['objetivo_flexibilizado', 'barrera_asignatura', 'ajuste_metodologico', 'ajuste_evaluativo', 'recursos', 'tipos_barrera', 'categorias_ajuste'] as const) {
    if (datos[campo] !== undefined) ajuste.set(campo, datos[campo]);
  }
  if (datos.dba_ids !== undefined) ajuste.set('dba_ids', [...new Set(datos.dba_ids)]);

  // La versión nueva (si el expediente ya estaba firmado) se calcula antes de guardar para que la edición la registre.
  const versionNueva = exp.estado === 'ACTIVO' || exp.estado === 'LISTO_PARA_ACUERDO' ? exp.version + 1 : exp.version;
  ajuste.ediciones.push({ por: usuario._id, fecha: new Date(), version_expediente: versionNueva });
  await ajuste.save();
  await guardarCambio(exp, usuario, 'Ajuste de asignatura', ip);
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_AJUSTE_GUARDADO', entidad: 'AjusteAsignatura', entidad_id: ajuste._id, ip });
  return vistaAjuste(ajuste);
}

export interface SeguimientoInput {
  periodo_numero: number;
  efectividad: EfectividadAjuste;
  observacion?: string;
  nueva_accion?: string;
}

/** Evaluación del ajuste: se hace con el expediente ya acordado (ACTIVO), en un periodo ya iniciado y no cerrado (M05). */
export async function registrarSeguimiento(expedienteId: string, subjectId: string, datos: SeguimientoInput, usuario: UserDocument, ip?: string | null) {
  const { exp, ctx } = await cargarConPermiso(expedienteId, usuario, 'VER_FICHA_PEDAGOGICA');
  const dicta = usuario.rol === ROLES.DOCENTE && (await docenteDictaAsignatura(usuario._id, ctx.grupo._id, exp.academic_year_id, subjectId));
  if (!permisoInclusion(comoUsuarioInclusion(usuario), { ...ctx.contexto, dictaLaAsignatura: dicta }, 'EDITAR_AJUSTE')) {
    throw new ApiError(403, 'Solo el docente que dicta la asignatura (u orientación) registra su seguimiento.');
  }
  await exigirEditable(exp);
  if (exp.estado !== 'ACTIVO') throw new ApiError(409, 'El seguimiento se registra cuando el acta de acuerdo está firmada (expediente ACTIVO).');

  const ajuste = await AjusteAsignatura.findOne({ expediente_id: exp._id, subject_id: subjectId });
  if (!ajuste) throw new ApiError(409, 'Esta asignatura no tiene ajuste que evaluar.');

  const anio = await AcademicYear.findById(exp.academic_year_id);
  const periodo = anio?.periodos.find((p) => p.numero === datos.periodo_numero);
  if (!periodo) throw new ApiError(400, 'El año lectivo no tiene ese periodo.');
  if (periodo.estado === 'PROGRAMADO') throw new ApiError(409, 'El periodo todavía no ha iniciado.');
  if (periodo.estado === 'CERRADO' && usuario.rol !== ROLES.ADMIN) throw new ApiError(409, 'El periodo está cerrado: solo un administrador puede registrar seguimiento en él.');

  ajuste.seguimientos.push({
    periodo_numero: datos.periodo_numero,
    fecha: new Date(),
    efectividad: datos.efectividad,
    observacion: datos.observacion ?? '',
    nueva_accion: datos.nueva_accion ?? '',
    por: usuario._id,
  } as never);
  await ajuste.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SEGUIMIENTO_REGISTRADO', entidad: 'AjusteAsignatura', entidad_id: ajuste._id, detalle: `Periodo ${datos.periodo_numero}`, ip });
  return vistaAjuste(ajuste);
}
