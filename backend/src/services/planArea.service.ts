import { Types } from 'mongoose';
import { avisarPlanEnRevision, avisarPlanRevisado } from './notificacionesEventos.service';
import { DecisionRevision, EstadoPlanVista, MAX_COMENTARIO_REVISION, NOMBRES_ESTADO_PLAN } from '../constants/planeacion';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import LiderArea from '../models/liderArea.model';
import PlanArea, { PlanAreaDocument } from '../models/planArea.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PdfSubido, borrarArchivo, guardarPdf, rutaAbsoluta } from '../utils/almacenPlaneacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { AlcanceLider, alcanceCubre, rebanadasSinCubrir, textoDeAlcance, textoDeRebanadas } from '../utils/liderArea';
import { motivoAreaPendiente, siguienteEstado } from '../utils/planeacion';
import { ContextoPlaneacion, permisoPlaneacion } from '../utils/permisosPlaneacion';
import { carpetaPlanArea } from '../utils/uploadPaths';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { cargarCoberturas, demandaDelAnio, nombresDeSedes } from './planeacionCobertura.service';
import { areasDondeImparte } from './planeacionContexto.service';
import { cargarPersonas, personasDePlan, resumenDePlan, vistaRevision, vistaVersion } from './planeacionVista.service';

export interface RadicarPlanAreaInput {
  academic_year_id: string;
  lider_area_id: string;
  titulo: string;
  descripcion: string;
}

export interface RevisarPlanInput {
  decision: DecisionRevision;
  comentario?: string;
}

/** El líder de un área con su área y su docente ya cargados. */
interface LiderConArea {
  _id: Types.ObjectId;
  area_id: { _id: Types.ObjectId; nombre: string; codigo: string };
  docente_id: { _id: Types.ObjectId; nombre: string; apellido: string; estado?: string };
  niveles: AlcanceLider['niveles'];
  jornada: AlcanceLider['jornada'];
  sedes_ids: Types.ObjectId[];
  estado: 'activo' | 'inactivo';
}

const esLider = (lider: LiderConArea, usuario: UserDocument): boolean => String(lider.docente_id._id) === String(usuario._id);

const alcanceDeLider = (l: Pick<LiderConArea, 'niveles' | 'jornada' | 'sedes_ids'>): AlcanceLider => ({ niveles: l.niveles, jornada: l.jornada, sedes_ids: l.sedes_ids.map(String) });

/** El alcance de un líder como lo muestra la pantalla: qué niveles, qué jornada, qué sedes y el texto ya armado. */
function vistaAlcance(l: Pick<LiderConArea, 'niveles' | 'jornada' | 'sedes_ids'>, sedes: ReadonlyMap<string, string>) {
  return {
    niveles: l.niveles,
    jornada: l.jornada,
    sedes: l.sedes_ids.map((id) => ({ _id: String(id), nombre: sedes.get(String(id)) ?? 'Sede' })),
    texto: textoDeAlcance(alcanceDeLider(l), sedes),
  };
}

/** Qué puede hacer quien consulta con este plan, ya resuelto en el servidor: la pantalla solo lo refleja. */
function permisosSobrePlan(usuario: UserDocument, contexto: ContextoPlaneacion, estado: EstadoPlanVista, anioCerrado: boolean, liderVigente: boolean) {
  const abierto = !anioCerrado;
  return {
    cargar: abierto && liderVigente && (estado === 'SIN_CARGAR' || estado === 'DEVUELTO') && permisoPlaneacion(usuario.rol, contexto, 'CARGAR_PLAN_AREA'),
    revisar: abierto && estado === 'EN_REVISION' && permisoPlaneacion(usuario.rol, contexto, 'REVISAR_PLAN'),
    reabrir: abierto && estado === 'APROBADO' && permisoPlaneacion(usuario.rol, contexto, 'REABRIR_PLAN'),
    ver_archivo: estado !== 'SIN_CARGAR' && permisoPlaneacion(usuario.rol, contexto, 'VER_PLAN_AREA'),
  };
}

async function cargarLider(id: string | Types.ObjectId): Promise<LiderConArea> {
  const lider = await LiderArea.findById(id).populate('area_id', 'nombre codigo').populate('docente_id', 'nombre apellido estado').lean();
  if (!lider || !(lider.area_id as unknown) || !(lider.docente_id as unknown)) throw new ApiError(404, 'Líder de área no encontrado.');
  return lider as unknown as LiderConArea;
}

/**
 * Una fila por cada líder de área con el estado de su plan (o «sin cargar»), y una fila «sin líder» por cada área (o parte de un área)
 * que nadie cubre. Coordinación y administración ven todo; un docente, lo que lidera y las áreas en las que dicta clase (en estas, solo
 * el plan ya aprobado).
 */
export async function listarPlanesDeArea(anioId: string, usuario: UserDocument) {
  const anio = await AcademicYear.findById(anioId).select('year estado').lean();
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const esGestion = usuario.rol !== ROLES.DOCENTE;
  const [areas, planes, demanda, dondeImparte, sedes] = await Promise.all([
    Area.find({ estado: ESTADO_ACTIVO }).sort({ nombre: 1 }).select('nombre codigo').lean(),
    PlanArea.find({ academic_year_id: anioId }).lean(),
    demandaDelAnio(anioId),
    usuario.rol === ROLES.DOCENTE ? areasDondeImparte(usuario._id, anioId) : Promise.resolve(null),
    nombresDeSedes(),
  ]);
  const coberturas = await cargarCoberturas(anioId, areas.map((a) => a._id), { conHistorial: true });
  const lideres = await LiderArea.find({ _id: { $in: coberturas.map((c) => c._id) } }).lean();
  const liderPorId = new Map(lideres.map((l) => [String(l._id), l]));
  const obligatoriaIds = new Set(demanda.areas.map((a) => String(a._id)));
  const planDe = new Map(planes.map((p) => [String(p.lider_area_id), p]));
  const personas = await cargarPersonas([...planes.flatMap(personasDePlan), ...coberturas.map((c) => c.docente_id)]);
  const cerrado = anio.estado === 'CERRADO';

  return areas.flatMap((area) => {
    const areaId = String(area._id);
    const obligatoria = obligatoriaIds.has(areaId);
    const demandadas = demanda.rebanadas.get(areaId) ?? [];
    const propias = coberturas.filter((c) => c.area_id === areaId);
    const imparte = dondeImparte?.has(areaId) ?? false;

    const filas = propias.flatMap((c) => {
      const lider = liderPorId.get(c._id);
      const plan = planDe.get(c._id);
      const soyLider = c.docente_id === String(usuario._id);
      if (!esGestion && !soyLider && !imparte) return [];

      const vigente = c.estado_registro === 'activo';
      const contexto: ContextoPlaneacion = { esLiderDelArea: soyLider, imparteEnElArea: imparte, estadoPlan: c.estado };
      // Los demás docentes del área saben en qué estado va, pero el plan (título, comentarios) solo lo ven una vez aprobado.
      const mostrarPlan = plan && (esGestion || soyLider || c.estado === 'APROBADO');
      const necesario = vigente && demandadas.some((r) => alcanceCubre(c.alcance, r));
      return [
        {
          clave: c._id,
          lider_area_id: c._id,
          area: { _id: areaId, nombre: area.nombre, codigo: area.codigo },
          alcance: lider ? vistaAlcance(lider, sedes.nombres) : null,
          sin_cubrir: null as string[] | null,
          lider: personas.get(c.docente_id) ?? null,
          vigente,
          soy_lider: soyLider,
          obligatoria,
          estado: c.estado,
          plan: mostrarPlan ? resumenDePlan(plan, personas) : null,
          pendiente_para_activar: obligatoria && necesario ? motivoAreaPendiente(c.docente_activo, c.estado) : null,
          puede: permisosSobrePlan(usuario, contexto, c.estado, cerrado, vigente),
        },
      ];
    });

    if (!esGestion) return filas;

    // Lo que ningún líder cubre (o el área entera si no tiene ninguno) aparece como una fila «sin líder» para que coordinación lo vea.
    const vigentes = propias.filter((c) => c.estado_registro === 'activo' && (c.docente_activo || c.estado === 'APROBADO'));
    const sinCubrir = rebanadasSinCubrir(demandadas, vigentes.map((c) => c.alcance));
    if (propias.length > 0 && sinCubrir.length === 0) return filas;
    return [
      ...filas,
      {
        clave: `${areaId}:sin-lider`,
        lider_area_id: null,
        area: { _id: areaId, nombre: area.nombre, codigo: area.codigo },
        alcance: null,
        sin_cubrir: textoDeRebanadas(sinCubrir, sedes.nombres, sedes.variasSedes),
        lider: null,
        vigente: true,
        soy_lider: false,
        obligatoria,
        estado: 'SIN_CARGAR' as EstadoPlanVista,
        plan: null,
        pendiente_para_activar: obligatoria && sinCubrir.length > 0 ? ('SIN_LIDER' as const) : null,
        puede: { cargar: false, revisar: false, reabrir: false, ver_archivo: false },
      },
    ];
  });
}

/** Detalle de un plan de área: sus versiones con quién y cuándo, y el historial de revisión con los comentarios de coordinación. */
export async function obtenerPlanDeArea(id: string, usuario: UserDocument) {
  const plan = await PlanArea.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de área no encontrado.');
  const [lider, anio, sedes] = await Promise.all([
    cargarLider(plan.lider_area_id),
    AcademicYear.findById(plan.academic_year_id).select('year estado').lean(),
    nombresDeSedes(),
  ]);

  const contexto: ContextoPlaneacion = {
    esLiderDelArea: esLider(lider, usuario),
    imparteEnElArea: usuario.rol === ROLES.DOCENTE ? (await areasDondeImparte(usuario._id, plan.academic_year_id)).has(String(lider.area_id._id)) : false,
    estadoPlan: plan.estado,
  };
  if (!permisoPlaneacion(usuario.rol, contexto, 'VER_PLAN_AREA')) throw new ApiError(404, 'Plan de área no encontrado.');

  const personas = await cargarPersonas([...personasDePlan(plan), lider.docente_id._id]);
  return {
    ...resumenDePlan(plan, personas),
    area: { _id: String(lider.area_id._id), nombre: lider.area_id.nombre, codigo: lider.area_id.codigo },
    lider_area_id: String(lider._id),
    alcance: vistaAlcance(lider, sedes.nombres),
    lider: personas.get(String(lider.docente_id._id)) ?? null,
    academic_year_id: String(plan.academic_year_id),
    anio: anio?.year ?? null,
    versiones: plan.versiones.map((v) => vistaVersion(v, personas)),
    revisiones: plan.revisiones.map((r) => vistaRevision(r, personas)),
    puede: permisosSobrePlan(usuario, contexto, plan.estado, anio?.estado === 'CERRADO', lider.estado === 'activo'),
  };
}

/**
 * El líder radica el plan de área de lo que cubre (la primera vez) o la corrección de uno devuelto. Un plan en revisión o aprobado
 * no se reemplaza. El archivo se escribe primero y se deshace si la base falla, como el resto de módulos que guardan PDF.
 */
export async function radicarPlanDeArea(input: RadicarPlanAreaInput, archivo: PdfSubido | undefined, usuario: UserDocument, ip?: string | null) {
  const lider = await cargarLider(input.lider_area_id);
  if (!esLider(lider, usuario)) throw new ApiError(403, 'Solo el docente líder del área puede cargar su plan de área.');
  if (lider.estado === 'inactivo') throw new ApiError(409, 'Ya no eres líder de esa parte del área: coordinación te quitó el cargo.');
  await asegurarAnioNoCerrado(input.academic_year_id);

  const existente = await PlanArea.findOne({ academic_year_id: input.academic_year_id, lider_area_id: lider._id });
  const estadoActual: EstadoPlanVista = existente?.estado ?? 'SIN_CARGAR';
  if (!siguienteEstado(estadoActual, 'RADICAR')) {
    throw new ApiError(
      409,
      estadoActual === 'APROBADO'
        ? 'El plan de área ya está aprobado para todo el año lectivo. Si debe corregirse, un administrador puede reabrirlo.'
        : `El plan de área está ${NOMBRES_ESTADO_PLAN[estadoActual]}: espera la decisión de coordinación.`
    );
  }

  const ahora = new Date();
  const _id = existente?._id ?? new Types.ObjectId();
  const numero = (existente?.versiones.length ?? 0) + 1;
  const guardado = await guardarPdf(carpetaPlanArea(String(_id)), `v${numero}`, archivo);
  const version = {
    numero,
    titulo: input.titulo,
    descripcion: input.descripcion,
    archivo: guardado,
    origen: 'CARGADA' as const,
    adoptado_de: null,
    subido_por: usuario._id,
    fecha: ahora,
  };

  let plan: PlanAreaDocument | null;
  try {
    plan = existente
      ? // `estado: DEVUELTO` cierra la carrera con otra radicación o con una decisión que llegue entre la lectura y esta escritura.
        await PlanArea.findOneAndUpdate({ _id, estado: 'DEVUELTO' }, { $set: { estado: 'EN_REVISION' }, $push: { versiones: version } }, { new: true })
      : await PlanArea.create({
          _id,
          academic_year_id: input.academic_year_id,
          area_id: lider.area_id._id,
          lider_area_id: lider._id,
          estado: 'EN_REVISION',
          versiones: [version],
        });
  } catch (err) {
    await borrarArchivo(guardado);
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ya existe un plan de área de este líder en el año lectivo.');
    throw err;
  }
  if (!plan) {
    await borrarArchivo(guardado);
    throw new ApiError(409, 'El plan de área cambió de estado: recarga e inténtalo de nuevo.');
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PLAN_AREA_RADICADO',
    entidad: 'PlanArea',
    entidad_id: plan._id,
    detalle: `${lider.area_id.nombre} (${textoDeAlcance(alcanceDeLider(lider))}), versión ${numero}.`,
    ip,
  });
  await avisarPlanEnRevision();
  return obtenerPlanDeArea(String(plan._id), usuario);
}

/** Coordinación o administración aprueban (para todo el año) o devuelven con un comentario que el líder debe poder leer. */
export async function revisarPlanDeArea(id: string, input: RevisarPlanInput, revisor: UserDocument, ip?: string | null) {
  const comentario = input.comentario?.trim() ?? '';
  if (input.decision === 'DEVUELTO' && !comentario) throw new ApiError(400, 'Para devolver el plan debes escribir un comentario: es lo que el docente va a corregir.');
  if (comentario.length > MAX_COMENTARIO_REVISION) throw new ApiError(400, `El comentario no puede superar los ${MAX_COMENTARIO_REVISION} caracteres.`);

  const plan = await PlanArea.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de área no encontrado.');
  await asegurarAnioNoCerrado(String(plan.academic_year_id));

  const nuevoEstado = siguienteEstado(plan.estado, input.decision === 'APROBADO' ? 'APROBAR' : 'DEVOLVER');
  if (!nuevoEstado) throw new ApiError(409, `Solo se revisa un plan en revisión (este está ${NOMBRES_ESTADO_PLAN[plan.estado]}).`);

  const revisada = await PlanArea.findOneAndUpdate(
    { _id: plan._id, estado: 'EN_REVISION' },
    {
      $set: { estado: nuevoEstado },
      $push: {
        revisiones: { accion: input.decision, version: plan.versiones.length, comentario, revisor_id: revisor._id, fecha: new Date(), automatica: false },
      },
    },
    { new: true }
  );
  if (!revisada) throw new ApiError(409, 'El plan ya fue revisado o cambió de estado: recarga e inténtalo de nuevo.');

  await registrarEvento({
    usuario_id: revisor._id,
    accion: 'PLAN_AREA_REVISADO',
    entidad: 'PlanArea',
    entidad_id: plan._id,
    detalle: `Plan de área → ${nuevoEstado}.`,
    ip,
  });
  const lider = await LiderArea.findById(plan.lider_area_id).select('docente_id area_id').lean();
  if (lider) await avisarPlanRevisado({ _id: plan._id, docenteId: lider.docente_id, decision: input.decision, areaId: lider.area_id });
  return obtenerPlanDeArea(id, revisor);
}

/** Solo el administrador, con motivo: una aprobación es una decisión formal y no se deshace sin dejar constancia de por qué. */
export async function reabrirPlanDeArea(id: string, motivo: string, actor: UserDocument, ip?: string | null) {
  if (actor.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador puede reabrir un plan de área aprobado.');
  const texto = motivo.trim();
  if (!texto) throw new ApiError(400, 'Escribe el motivo de la reapertura.');

  const plan = await PlanArea.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de área no encontrado.');
  await asegurarAnioNoCerrado(String(plan.academic_year_id));
  if (!siguienteEstado(plan.estado, 'REABRIR')) throw new ApiError(409, `Solo se reabre un plan aprobado (este está ${NOMBRES_ESTADO_PLAN[plan.estado]}).`);

  const reabierto = await PlanArea.findOneAndUpdate(
    { _id: plan._id, estado: 'APROBADO' },
    {
      $set: { estado: 'DEVUELTO' },
      $push: { revisiones: { accion: 'REABIERTO', version: plan.versiones.length, comentario: texto, revisor_id: actor._id, fecha: new Date(), automatica: false } },
    },
    { new: true }
  );
  if (!reabierto) throw new ApiError(409, 'El plan cambió de estado: recarga e inténtalo de nuevo.');

  await registrarEvento({ usuario_id: actor._id, accion: 'PLAN_AREA_REABIERTO', entidad: 'PlanArea', entidad_id: plan._id, detalle: 'Plan de área reabierto.', ip });
  return obtenerPlanDeArea(id, actor);
}

/** Ruta del PDF de una versión (la última si no se indica): lo ven coordinación, el líder y, ya aprobado, los docentes del área. */
export async function rutaDelArchivoPlanDeArea(id: string, version: number | undefined, usuario: UserDocument): Promise<{ ruta: string; nombre: string }> {
  const plan = await PlanArea.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de área no encontrado.');
  const lider = await cargarLider(plan.lider_area_id);
  const contexto: ContextoPlaneacion = {
    esLiderDelArea: esLider(lider, usuario),
    imparteEnElArea: usuario.rol === ROLES.DOCENTE ? (await areasDondeImparte(usuario._id, plan.academic_year_id)).has(String(lider.area_id._id)) : false,
    estadoPlan: plan.estado,
  };
  if (!permisoPlaneacion(usuario.rol, contexto, 'VER_PLAN_AREA')) throw new ApiError(404, 'Plan de área no encontrado.');

  const elegida = version === undefined ? plan.versiones.at(-1) : plan.versiones.find((v) => v.numero === version);
  if (!elegida) throw new ApiError(404, 'Esa versión del plan de área no existe.');
  return { ruta: rutaAbsoluta(elegida.archivo), nombre: elegida.archivo.nombre };
}
