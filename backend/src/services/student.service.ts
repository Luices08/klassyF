import { PipelineStage, Types } from 'mongoose';
import { EstadoEstudiante, GENEROS, GRUPOS_ETNICOS, GRUPOS_SANGUINEOS, PARENTESCOS, REGIMENES_SALUD, Rol, TIPOS_DOCUMENTO } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { leerCsv } from '../utils/csv';
import { ocultarSaludAdministrativa } from '../utils/datosSensibles';
import { generarPasswordTemporal } from '../utils/generarPasswordTemporal';

export interface ListarEstudiantesFilter {
  search?: string;
  estado?: EstadoEstudiante;
  eps?: string;
  discapacidad?: boolean;
  page?: number;
  limit?: number;
}

function escapeRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listarEstudiantes(filter: ListarEstudiantesFilter, rolSolicitante: Rol) {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

  const matchUser: Record<string, unknown> = { rol: ROLES.ESTUDIANTE };
  if (filter.search) {
    const regex = new RegExp(escapeRegex(filter.search), 'i');
    matchUser.$or = [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }, { email: regex }];
  }

  const pipeline: PipelineStage[] = [
    { $match: matchUser },
    // No usar aggregate() salta el select:false/toJSON del schema: se excluyen
    // aqui a mano los campos sensibles para que nunca lleguen al resultado.
    { $project: { password_hash: 0, version_sesion: 0, __v: 0 } },
    {
      $lookup: { from: 'studentprofiles', localField: '_id', foreignField: 'user_id', as: 'perfil' },
    },
    { $unwind: { path: '$perfil', preserveNullAndEmptyArrays: true } },
  ];

  const matchPerfil: Record<string, unknown> = {};
  if (filter.estado) matchPerfil['perfil.estado'] = filter.estado;
  // Filtrar/buscar por EPS es tratar el dato sensible, no solo mostrarlo: se
  // reserva a personal administrativo (Ley 1581, minimizacion de datos).
  if (filter.eps && rolSolicitante !== ROLES.DOCENTE) {
    matchPerfil['perfil.eps'] = new RegExp(escapeRegex(filter.eps), 'i');
  }
  if (filter.discapacidad !== undefined) matchPerfil['perfil.tiene_discapacidad'] = filter.discapacidad;
  if (Object.keys(matchPerfil).length > 0) pipeline.push({ $match: matchPerfil });

  pipeline.push(
    { $sort: { apellido: 1, nombre: 1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    }
  );

  const [resultado] = await User.aggregate(pipeline);
  const data: Array<Record<string, unknown>> = resultado?.data ?? [];
  const total: number = resultado?.totalCount?.[0]?.count ?? 0;

  const ids = data.map((d) => d._id);
  const principales = await StudentGuardian.find({ student_id: { $in: ids }, es_principal: true }).populate(
    'guardian_id',
    'nombre apellido telefono_principal email'
  );
  const principalPorEstudiante = new Map(principales.map((p) => [String(p.student_id), p.guardian_id]));

  const items = data.map((d) => ({
    ...(d.perfil ? { ...d, perfil: ocultarSaludAdministrativa(d.perfil as Record<string, unknown>, rolSolicitante) } : d),
    acudiente_principal: principalPorEstudiante.get(String(d._id)) ?? null,
  }));

  return { data: items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function obtenerFicha360(studentId: string, rolSolicitante: Rol) {
  const estudiante = await User.findOne({ _id: studentId, rol: ROLES.ESTUDIANTE });
  if (!estudiante) throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');

  const [perfilDoc, acudientes, matriculas] = await Promise.all([
    StudentProfile.findOne({ user_id: studentId }),
    StudentGuardian.find({ student_id: studentId }).populate('guardian_id').sort({ es_principal: -1 }),
    Enrollment.find({ student_id: studentId })
      .populate('group_id', 'nomenclatura grade_id sede_id')
      .populate('academic_year_id', 'year calendario')
      .sort({ fecha_matricula: -1 }),
  ]);

  const perfil = perfilDoc ? ocultarSaludAdministrativa(perfilDoc.toObject(), rolSolicitante) : null;

  return { estudiante, perfil, acudientes, matriculas };
}

interface FilaImportacionError {
  fila: number;
  numero_documento?: string;
  motivo: string;
}

function esVerdadero(valor: string): boolean {
  return ['si', 'sí', 'true', '1', 'x'].includes(valor.trim().toLowerCase());
}

const COLUMNAS_OBLIGATORIAS_ESTUDIANTES = [
  'tipo_documento',
  'numero_documento',
  'nombre',
  'apellido',
  'email',
  'fecha_nacimiento',
];

/**
 * Valor de una lista cerrada (acepta minusculas). Vacio -> undefined; con valor pero fuera de la
 * lista -> error de fila, en vez de descartarlo en silencio y perder el dato.
 */
function valorDeLista<T extends string>(campo: string, valor: string | undefined, lista: readonly T[]): T | undefined {
  const limpio = (valor ?? '').trim();
  if (!limpio) return undefined;
  const hallado = lista.find((v) => v.toUpperCase() === limpio.toUpperCase());
  if (!hallado) throw new ApiError(400, `${campo} "${limpio}" no es valido. Usa: ${lista.join(', ')}.`);
  return hallado;
}

/** Fecha de calendario como YYYY-MM-DD (o DD/MM/YYYY, lo que Excel en español guarda al mostrar fechas). Medianoche UTC. */
function parsearFechaNacimiento(valor: string): Date {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(valor);
  const latina = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor);
  const partes = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : latina ? [Number(latina[3]), Number(latina[2]), Number(latina[1])] : null;
  if (!partes) throw new ApiError(400, `fecha_nacimiento "${valor}" no tiene formato valido. Usa YYYY-MM-DD (ej. 2015-03-24).`);

  const [anio, mes, dia] = partes as [number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    throw new ApiError(400, `fecha_nacimiento "${valor}" no es una fecha real.`);
  }
  if (fecha.getTime() > Date.now()) throw new ApiError(400, `fecha_nacimiento "${valor}" no puede ser futura.`);
  return fecha;
}

const COLUMNAS_ACUDIENTE = [
  'acudiente_numero_documento',
  'acudiente_nombre',
  'acudiente_apellido',
  'acudiente_telefono',
  'acudiente_parentesco',
] as const;

/**
 * Carga masiva (M03): CSV con encabezado
 * tipo_documento,numero_documento,nombre,apellido,email,fecha_nacimiento,genero,rh,eps,
 * regimen_salud,autorizacion_datos_sensibles,estrato,direccion_residencia,barrio_vereda,
 * municipio,grupo_etnico,victima_conflicto,tiene_discapacidad,tiene_talento_excepcional,
 * institucion_procedencia,acudiente_tipo_documento,acudiente_numero_documento,
 * acudiente_nombre,acudiente_apellido,acudiente_telefono,acudiente_parentesco
 * Separador coma o punto y coma (se detecta). Toda la fila se valida ANTES de crear el usuario.
 * `autorizacion_datos_sensibles` (si/no) es obligatoria si la fila trae rh, eps o regimen_salud
 * (Ley 1581 de 2012, art. 6) — quien autoriza queda registrado como el acudiente de la misma
 * fila, si se diligencio. `alergias_condiciones` no es columna de este CSV todavia (solo se
 * edita desde la ficha individual del estudiante).
 */
export async function importarEstudiantesCsv(buffer: Buffer, registradoPorId: Types.ObjectId | string) {
  const { registros } = leerCsv(buffer, COLUMNAS_OBLIGATORIAS_ESTUDIANTES);
  if (registros.length === 0) throw new ApiError(400, 'El archivo no tiene filas de datos.');

  const errores: FilaImportacionError[] = [];
  let creados = 0;

  for (let i = 0; i < registros.length; i++) {
    const fila = i + 2;
    const r = registros[i]!;
    const numeroDocumento = r.numero_documento;
    let estudianteId: Types.ObjectId | null = null;

    try {
      if (!r.tipo_documento || !numeroDocumento || !r.nombre || !r.apellido || !r.email || !r.fecha_nacimiento) {
        throw new ApiError(
          400,
          'Faltan columnas obligatorias (tipo_documento, numero_documento, nombre, apellido, email, fecha_nacimiento).'
        );
      }
      const tipoDocumento = valorDeLista('tipo_documento', r.tipo_documento, TIPOS_DOCUMENTO);
      const fechaNacimiento = parsearFechaNacimiento(r.fecha_nacimiento);
      const genero = valorDeLista('genero', r.genero, GENEROS);
      const rh = valorDeLista('rh', r.rh, GRUPOS_SANGUINEOS);
      const regimenSalud = valorDeLista('regimen_salud', r.regimen_salud, REGIMENES_SALUD);
      const grupoEtnico = valorDeLista('grupo_etnico', r.grupo_etnico, GRUPOS_ETNICOS);

      // Ley 1581 de 2012, art. 6: traer datos de salud en la fila exige la
      // autorizacion explicita del acudiente, igual que en el formulario individual.
      const hayDatoSalud = Boolean(rh || regimenSalud || r.eps);
      const autorizacionDatosSensibles = r.autorizacion_datos_sensibles ? esVerdadero(r.autorizacion_datos_sensibles) : false;
      if (hayDatoSalud && !autorizacionDatosSensibles) {
        throw new ApiError(
          400,
          'Esta fila trae datos de salud (rh, eps o regimen_salud) pero no marca "autorizacion_datos_sensibles" ' +
            'en si: se requiere la autorizacion explicita del acudiente (Ley 1581 de 2012, art. 6).'
        );
      }

      let estrato: number | undefined;
      if (r.estrato) {
        estrato = Number(r.estrato);
        if (!Number.isInteger(estrato) || estrato < 1 || estrato > 6) {
          throw new ApiError(400, `estrato "${r.estrato}" no es valido. Usa un numero entero de 1 a 6.`);
        }
      }

      // Acudiente: o se completan todas sus columnas o ninguna (antes una fila incompleta lo omitia sin avisar).
      const acudienteEscrito = COLUMNAS_ACUDIENTE.some((c) => r[c]);
      let parentesco: (typeof PARENTESCOS)[number] | undefined;
      let acudienteTipoDocumento: (typeof TIPOS_DOCUMENTO)[number] = 'CC';
      if (acudienteEscrito) {
        const faltantes = COLUMNAS_ACUDIENTE.filter((c) => !r[c]);
        if (faltantes.length > 0) {
          throw new ApiError(400, `Datos del acudiente incompletos: falta ${faltantes.join(', ')}.`);
        }
        parentesco = valorDeLista('acudiente_parentesco', r.acudiente_parentesco, PARENTESCOS);
        acudienteTipoDocumento = valorDeLista('acudiente_tipo_documento', r.acudiente_tipo_documento, TIPOS_DOCUMENTO) ?? 'CC';
      }

      const student = new User({
        nombre: r.nombre,
        apellido: r.apellido,
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento,
        email: r.email,
        rol: ROLES.ESTUDIANTE,
        debe_cambiar_password: true,
      });
      student.password = generarPasswordTemporal();
      await student.save();
      estudianteId = student._id;

      await StudentProfile.create({
        user_id: student._id,
        fecha_nacimiento: fechaNacimiento,
        genero,
        rh,
        eps: r.eps || undefined,
        regimen_salud: regimenSalud,
        estrato,
        direccion_residencia: r.direccion_residencia || undefined,
        barrio_vereda: r.barrio_vereda || undefined,
        municipio: r.municipio || undefined,
        grupo_etnico: grupoEtnico,
        victima_conflicto: r.victima_conflicto ? esVerdadero(r.victima_conflicto) : undefined,
        tiene_discapacidad: r.tiene_discapacidad ? esVerdadero(r.tiene_discapacidad) : undefined,
        tiene_talento_excepcional: r.tiene_talento_excepcional ? esVerdadero(r.tiene_talento_excepcional) : undefined,
        institucion_procedencia: r.institucion_procedencia || undefined,
        autorizacion_datos_sensibles: hayDatoSalud
          ? {
              otorgada: true,
              otorgado_por_nombre: parentesco ? `${r.acudiente_nombre} ${r.acudiente_apellido}` : null,
              fecha: new Date(),
              registrado_por_id: registradoPorId,
            }
          : undefined,
      });

      if (parentesco) {
        let guardian = await Guardian.findOne({ numero_documento: r.acudiente_numero_documento });
        if (!guardian) {
          guardian = await Guardian.create({
            tipo_documento: acudienteTipoDocumento,
            numero_documento: r.acudiente_numero_documento,
            nombre: r.acudiente_nombre,
            apellido: r.acudiente_apellido,
            telefono_principal: r.acudiente_telefono,
          });
        }
        await StudentGuardian.create({
          student_id: student._id,
          guardian_id: guardian._id,
          parentesco,
          es_principal: true,
        });
      }

      creados += 1;
    } catch (err) {
      // Si algo fallo despues de crear el usuario, no se deja un estudiante a medias (sin perfil o sin acudiente).
      if (estudianteId) {
        await Promise.all([
          StudentGuardian.deleteMany({ student_id: estudianteId }),
          StudentProfile.deleteOne({ user_id: estudianteId }),
          User.deleteOne({ _id: estudianteId }),
        ]);
      }
      const motivo =
        err instanceof ApiError
          ? err.message
          : (err as { code?: number }).code === 11000
            ? 'El numero de documento o el correo ya estan registrados.'
            : 'No se pudo crear el estudiante.';
      errores.push({ fila, numero_documento: numeroDocumento, motivo });
    }
  }

  return { total_filas: registros.length, creados, fallidos: errores.length, errores };
}
