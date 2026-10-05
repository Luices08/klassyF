import { ClaveDocumentoPiar } from '../constants/inclusion';
import AcademicYear from '../models/academicYear.model';
import AjusteAsignatura from '../models/ajusteAsignatura.model';
import { ExpedienteInclusionDocument } from '../models/expedienteInclusion.model';
import Guardian from '../models/guardian.model';
import Institution from '../models/institution.model';
import ReferenteCurricular from '../models/referenteCurricular.model';
import StudentGuardian from '../models/studentGuardian.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { esMayorDeEdad } from '../utils/inclusion';
import DocumentoPiar from '../models/documentoPiar.model';
import { identidadDelEstudiante } from './expedienteInclusion.service';
import { asignaturasEsperadas, ContextoEstudianteInclusion, obtenerConfiguracion } from './inclusionContexto.service';
import { User } from '../models/user.model';

type Snapshot = Record<string, unknown>;

const iso = (fecha: Date | null | undefined) => (fecha ? fecha.toISOString() : null);

/** El encabezado lleva solo texto (no el logo): cómo se ve lo resolverá M21/M32; el logo se aplica al dibujar el PDF. */
async function encabezadoYEstudiante(exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion) {
  const [institucion, identidad, anio] = await Promise.all([Institution.findOne(), identidadDelEstudiante(exp, ctx), AcademicYear.findById(exp.academic_year_id).select('year')]);
  const { perfil, ...estudiante } = identidad;
  return {
    perfil,
    encabezado: {
      institucion: institucion?.nombre ?? 'Institución Educativa',
      codigo_dane: institucion?.codigo_dane ?? '',
      nit: institucion?.nit ?? '',
      resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
      sede: identidad.sede,
      jornada: identidad.jornada,
      anio: anio?.year ?? null,
    },
    estudiante: { ...estudiante, fecha_nacimiento: iso(identidad.fecha_nacimiento), tipo_ingreso: ctx.matricula.tipo_ingreso },
  };
}

async function acudientesDe(studentId: ExpedienteInclusionDocument['student_id']) {
  const vinculos = await StudentGuardian.find({ student_id: studentId });
  const acudientes = await Guardian.find({ _id: { $in: vinculos.map((v) => v.guardian_id) } });
  const porId = new Map(acudientes.map((a) => [String(a._id), a]));
  return vinculos
    .map((v) => {
      const a = porId.get(String(v.guardian_id));
      return a ? { nombre: `${a.nombre} ${a.apellido}`, parentesco: v.parentesco, telefono: a.telefono_principal, correo: a.email ?? '', es_principal: v.es_principal } : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => Number(b.es_principal) - Number(a.es_principal));
}

/** Texto de cada referente del banco (M07): se congela el texto al emitir, así el documento no cambia si el banco se actualiza. */
async function textoDeReferentes(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const referentes = await ReferenteCurricular.find({ _id: { $in: ids } }).lean();
  return new Map(
    referentes.map((r) => {
      const x = r as unknown as { _id: unknown; tipo_referente: string; numero_dba?: number; enunciado?: string; competencia?: string; titulo?: string };
      const etiqueta = x.tipo_referente === 'DBA' ? `DBA ${x.numero_dba ?? ''}` : x.tipo_referente;
      return [String(x._id), `${etiqueta}: ${x.enunciado ?? x.competencia ?? x.titulo ?? ''}`.trim()] as const;
    })
  );
}

async function filasDeAjustes(exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion) {
  const [esperadas, ajustes] = await Promise.all([asignaturasEsperadas(ctx.grupo), AjusteAsignatura.find({ expediente_id: exp._id })]);
  const docentes = await User.find({ _id: { $in: esperadas.map((e) => e.docente_id).filter(Boolean) } }).select('nombre apellido');
  const nombreDocente = new Map(docentes.map((d) => [String(d._id), `${d.nombre} ${d.apellido}`]));
  const referentes = await textoDeReferentes([...new Set(ajustes.flatMap((a) => a.dba_ids.map(String)))]);
  const porAsignatura = new Map(ajustes.map((a) => [String(a.subject_id), a]));

  return esperadas.map((e) => {
    const a = porAsignatura.get(e.subject_id);
    return {
      area: e.area,
      asignatura: e.nombre,
      docente: e.docente_id ? (nombreDocente.get(e.docente_id) ?? '') : '',
      objetivos_referentes: a ? a.dba_ids.map((id) => referentes.get(String(id)) ?? '').filter(Boolean) : [],
      objetivo_flexibilizado: a?.objetivo_flexibilizado ?? '',
      barreras: a?.barrera_asignatura ?? '',
      tipos_barrera: a?.tipos_barrera ?? [],
      ajuste_metodologico: a?.ajuste_metodologico ?? '',
      ajuste_evaluativo: a?.ajuste_evaluativo ?? '',
      categorias_ajuste: a?.categorias_ajuste ?? [],
      recursos: a?.recursos ?? '',
      seguimientos: (a?.seguimientos ?? []).map((s) => ({ periodo: s.periodo_numero, fecha: iso(s.fecha), efectividad: s.efectividad, observacion: s.observacion, nueva_accion: s.nueva_accion })),
    };
  });
}

const pedagogicas = (exp: ExpedienteInclusionDocument) => {
  const c = exp.caracteristicas;
  return {
    descripcion_general: c.descripcion_general,
    gustos_intereses: c.gustos_intereses,
    aspectos_que_le_desagradan: c.aspectos_que_le_desagradan,
    expectativas_estudiante: c.expectativas_estudiante,
    expectativas_familia: c.expectativas_familia,
    lo_que_hace_puede_requiere_apoyo: c.lo_que_hace_puede_requiere_apoyo,
    habilidades_competencias: c.habilidades_competencias,
    valoracion_pedagogica: c.valoracion_pedagogica,
  };
};

const ultimoEmitido = (exp: ExpedienteInclusionDocument, clave: ClaveDocumentoPiar) =>
  DocumentoPiar.findOne({ expediente_id: exp._id, clave, estado: { $ne: 'SUSTITUIDO' } }).sort({ version: -1 });

/**
 * Contenido que se congela al emitir cada documento. Es lo único que dibuja el PDF; así lo firmado no cambia aunque el expediente
 * siga evolucionando. Los datos de la persona, el grupo y los acudientes se LEEN de M01/M03/M04 en este momento (regla de oro).
 */
export async function construirSnapshot(clave: ClaveDocumentoPiar, exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion, usuario: UserDocument): Promise<Snapshot> {
  const configuracion = await obtenerConfiguracion();
  const base = await encabezadoYEstudiante(exp, ctx);
  const { perfil, encabezado, estudiante } = base;
  const comun = { encabezado, estudiante, fecha_elaboracion: iso(exp.createdAt), version_expediente: exp.version, emitido_por: `${usuario.nombre} ${usuario.apellido}` };

  switch (clave) {
    case 'ANEXO_INFO_GENERAL':
      return {
        ...comun,
        categoria_discapacidad: exp.categoria_discapacidad,
        salud_administrativa: { eps: perfil?.eps ?? null, regimen_salud: perfil?.regimen_salud ?? null },
        institucion_procedencia: perfil?.institucion_procedencia ?? '',
        anexo: exp.toObject().anexo_info_general,
        acudientes: await acudientesDe(exp.student_id),
      };

    case 'PIAR_AJUSTES': {
      const filas = await filasDeAjustes(exp, ctx);
      return {
        ...comun,
        docentes_elaboran: [...new Set(filas.filter((f) => f.docente).map((f) => f.docente))],
        caracteristicas: pedagogicas(exp),
        ajustes: filas,
        transversales: exp.toObject().transversales,
        pmi: exp.toObject().pmi,
        recursos_necesarios: exp.caracteristicas.recursos_necesarios,
        proyectos_especificos: exp.caracteristicas.proyectos_especificos,
        otra_informacion: exp.caracteristicas.otra_informacion,
        actividades_en_casa_receso: exp.caracteristicas.actividades_en_casa_receso,
        seguimientos_minimos: configuracion.seguimientos_minimos_anio,
      };
    }

    case 'ACTA_ACUERDO_FAMILIA': {
      const piar = await ultimoEmitido(exp, 'PIAR_AJUSTES');
      if (!piar) throw new ApiError(409, 'Emite primero el PIAR (Anexo 2): el acta lo referencia por su versión.');
      const filas = await filasDeAjustes(exp, ctx);
      const mayor = perfil?.fecha_nacimiento ? esMayorDeEdad(perfil.fecha_nacimiento, new Date()) : false;
      return {
        ...comun,
        declaracion_establecimiento: configuracion.declaracion_establecimiento,
        declaracion_familia: configuracion.declaracion_familia,
        referencia_piar: { codigo: piar.codigo, version: piar.version, hash: piar.hash },
        resumen_ajustes: filas.filter((f) => f.ajuste_metodologico || f.ajuste_evaluativo).map((f) => ({ asignatura: f.asignatura, ajuste_metodologico: f.ajuste_metodologico, ajuste_evaluativo: f.ajuste_evaluativo })),
        compromisos_institucionales: exp.caracteristicas.recomendaciones_aula,
        compromisos_aula: exp.compromisos_aula,
        compromisos_familia: exp.toObject().compromisos_familia,
        acudientes: await acudientesDe(exp.student_id),
        firma_requerida: mayor ? 'ESTUDIANTE' : 'ACUDIENTE',
      };
    }

    case 'INFORME_ANUAL': {
      const filas = await filasDeAjustes(exp, ctx);
      return {
        ...comun,
        informe: exp.toObject().informe_anual,
        por_asignatura: filas.map((f) => ({ asignatura: f.asignatura, docente: f.docente, seguimientos: f.seguimientos })),
        seguimientos_minimos: configuracion.seguimientos_minimos_anio,
      };
    }

    case 'ACTA_OFICIAL_PIAR': {
      const [piar, acta] = await Promise.all([ultimoEmitido(exp, 'PIAR_AJUSTES'), ultimoEmitido(exp, 'ACTA_ACUERDO_FAMILIA')]);
      if (!piar || !acta) throw new ApiError(409, 'Emite primero el PIAR (Anexo 2) y el acta de acuerdo con la familia: el acta oficial los reúne.');
      const info = await ultimoEmitido(exp, 'ANEXO_INFO_GENERAL');
      const a = (info?.snapshot ?? {}) as { anexo?: { hogar?: unknown; educativo?: unknown; salud?: { terapias?: unknown; productos_apoyo?: unknown } } };
      return {
        ...comun,
        partes: [info, piar, acta].filter((d): d is NonNullable<typeof d> => Boolean(d)).map((d) => ({ clave: d.clave, codigo: d.codigo, version: d.version, hash: d.hash })),
        // Versión "carpeta": hogar, trayectoria educativa y apoyos. Sin diagnóstico, tratamiento, medicamentos, categoría, EPS ni régimen.
        anexo1_carpeta: info ? { hogar: a.anexo?.hogar, educativo: a.anexo?.educativo, terapias: a.anexo?.salud?.terapias, productos_apoyo: a.anexo?.salud?.productos_apoyo } : null,
        piar: piar.snapshot,
        acta: acta.snapshot,
      };
    }

    case 'PLAN_APOYO':
      return {
        ...comun,
        plan: exp.toObject().plan_apoyo,
        compromisos_familia: exp.toObject().compromisos_familia,
        acudientes: await acudientesDe(exp.student_id),
        firma_requerida: perfil?.fecha_nacimiento && esMayorDeEdad(perfil.fecha_nacimiento, new Date()) ? 'ESTUDIANTE' : 'ACUDIENTE',
      };
  }
}
