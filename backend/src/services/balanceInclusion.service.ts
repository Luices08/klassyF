import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { EstadoExpediente } from '../constants/inclusion';
import { ROLES } from '../constants/roles';
import AjusteAsignatura from '../models/ajusteAsignatura.model';
import DocumentoPiar from '../models/documentoPiar.model';
import Enrollment from '../models/enrollment.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Institution from '../models/institution.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ROLES_BANDEJA_INCLUSION } from '../utils/permisosInclusion';
import { ReporteTabular, nombreDeArchivo } from '../utils/reporteTabular';
import { FiltrosAlcance, describirAlcance, gruposDelAlcance } from './alcanceReportes.service';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { obtenerConfiguracion } from './inclusionContexto.service';

const ETIQUETA_ESTADO: Record<EstadoExpediente, string> = {
  BORRADOR: 'Borrador',
  EN_CONSTRUCCION: 'En construcción',
  LISTO_PARA_ACUERDO: 'Listo para acuerdo',
  ACTIVO: 'Activo',
  CERRADO: 'Cerrado',
};

/**
 * Balance anual de inclusión (M16): cómo va cada expediente al cerrar el año. Es información de salud de menores: lo ven el administrador y orientación
 * (de sus sedes) con el detalle por estudiante, y coordinación solo supervisa, así que no ve la modalidad (PIAR o plan de apoyo) de nadie. Secretaría,
 * convivencia, docentes y familias no tienen acceso. No muestra categoría de discapacidad, diagnóstico ni soportes clínicos, y no guarda nada.
 */
export async function reporteBalanceInclusion(filtros: FiltrosAlcance & { academic_year_id: string }, usuario: UserDocument, ip?: string | null): Promise<ReporteTabular> {
  if (!ROLES_BANDEJA_INCLUSION.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso al balance de inclusión.');
  const veModalidad = usuario.rol !== ROLES.COORDINADOR;
  const anio = await cargarAnio(filtros.academic_year_id);
  const todos = await gruposDelAlcance(anio._id, filtros, usuario);
  // Orientación y coordinación solo ven las sedes que tienen asignadas (como en el resto de M16); el administrador, todas.
  const propias = (usuario.sedes_ids ?? []).map(String);
  const grupos = usuario.rol === ROLES.ADMIN ? todos : todos.filter((g) => propias.includes(String(g.sede_id)));
  if (grupos.length === 0) throw new ApiError(404, 'No hay grupos que coincidan con los filtros elegidos.');

  const [institucion, configuracion] = await Promise.all([Institution.findOne().select('nombre').lean(), obtenerConfiguracion()]);
  const minimo = configuracion.seguimientos_minimos_anio;
  const grupoPor = new Map(grupos.map((g) => [String(g._id), g]));

  const matriculas = await Enrollment.find({ academic_year_id: anio._id, estado: { $in: [...ESTADOS_MATRICULA_ACTIVOS, 'RETIRADO'] }, group_id: { $in: grupos.map((g) => g._id) } }).select('student_id group_id estado').lean();
  // Si un estudiante tiene una matrícula viva y otra retirada, manda la viva.
  const matriculaPor = new Map<string, (typeof matriculas)[number]>();
  for (const m of matriculas) {
    const previa = matriculaPor.get(String(m.student_id));
    if (!previa || previa.estado === 'RETIRADO') matriculaPor.set(String(m.student_id), m);
  }
  const ids = [...matriculaPor.keys()];
  const expedientes = await ExpedienteInclusion.find({ academic_year_id: anio._id, student_id: { $in: ids } }).select('student_id tipo estado consentimiento fecha_limite_elaboracion').lean();
  const expedienteIds = expedientes.map((x) => x._id);
  const [usuarios, ajustes, informes] = await Promise.all([
    User.find({ _id: { $in: expedientes.map((x) => x.student_id) } }).select('nombre apellido numero_documento').lean(),
    AjusteAsignatura.find({ expediente_id: { $in: expedienteIds } }).select('expediente_id seguimientos.periodo_numero').lean(),
    DocumentoPiar.find({ expediente_id: { $in: expedienteIds }, clave: 'INFORME_ANUAL', estado: { $ne: 'SUSTITUIDO' } }).select('expediente_id estado').lean(),
  ]);
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
  const ajustesPor = new Map<string, typeof ajustes>();
  for (const a of ajustes) ajustesPor.set(String(a.expediente_id), [...(ajustesPor.get(String(a.expediente_id)) ?? []), a]);
  const informePor = new Map(informes.map((i) => [String(i.expediente_id), i.estado as string]));

  const ahora = Date.now();
  const calculo = expedientes
    .map((x) => {
      const u = usuarioPor.get(String(x.student_id));
      const grupo = grupoPor.get(String(matriculaPor.get(String(x.student_id))?.group_id));
      const suyos = ajustesPor.get(String(x._id)) ?? [];
      // Un ajuste cumple cuando tiene seguimientos en al menos tantos periodos distintos como el mínimo que fijó el colegio.
      const cumplen = suyos.filter((a) => new Set((a.seguimientos ?? []).map((s) => s.periodo_numero)).size >= minimo).length;
      const informe = informePor.get(String(x._id));
      const esPiar = x.tipo === 'PIAR';
      return {
        orden: grupo?.gradoNumero ?? 0,
        grupo: grupo?.etiqueta ?? '',
        documento: u?.numero_documento ?? '',
        estudiante: u ? `${u.apellido} ${u.nombre}` : '',
        modalidad: veModalidad ? (esPiar ? 'PIAR' : 'Plan de apoyo') : '',
        estado: ETIQUETA_ESTADO[x.estado as EstadoExpediente] ?? x.estado,
        consentimiento: x.consentimiento?.otorgado && !x.consentimiento?.revocado ? 'Vigente' : 'Sin autorización',
        seguimientos: esPiar ? (suyos.length === 0 ? 'Sin ajustes' : `${cumplen} de ${suyos.length}`) : 'No aplica',
        informe: esPiar ? (informe === 'FIRMADO' ? 'Firmado' : informe === 'EMITIDO' ? 'Emitido' : 'Sin emitir') : 'No aplica',
        plazo: ['BORRADOR', 'EN_CONSTRUCCION'].includes(x.estado) && x.fecha_limite_elaboracion && new Date(x.fecha_limite_elaboracion).getTime() < ahora ? 'Vencido' : '',
        _esPiar: esPiar,
        _cumplen: cumplen,
        _ajustes: suyos.length,
      };
    })
    .filter((f) => f.grupo !== '')
    .sort((a, b) => a.orden - b.orden || a.grupo.localeCompare(b.grupo, 'es') || a.estudiante.localeCompare(b.estudiante, 'es'));

  // Las columnas auxiliares (orden, ajustes) sirven para sumar y ordenar; no viajan al archivo.
  const filas = calculo.map(({ orden: _orden, _esPiar, _cumplen, _ajustes, ...visible }) => visible);
  const por = (estado: string) => calculo.filter((f) => f.estado === estado).length;
  const piar = calculo.filter((f) => f._esPiar);
  const ajustesTotales = piar.reduce((s, f) => s + f._ajustes, 0);
  const ajustesCumplen = piar.reduce((s, f) => s + f._cumplen, 0);
  const resumen: ReporteTabular['resumen'] = [['Estudiantes con expediente', calculo.length]];
  if (veModalidad) resumen.push(['PIAR', piar.length], ['Plan de apoyo', calculo.length - piar.length]);
  resumen.push(
    ['Activos', por('Activo')],
    ['En construcción o borrador', por('En construcción') + por('Borrador') + por('Listo para acuerdo')],
    ['Cerrados', por('Cerrado')],
    ['Ajustes con el seguimiento mínimo', `${ajustesCumplen} de ${ajustesTotales}`],
    ['Informes anuales emitidos o firmados', `${piar.filter((f) => f.informe === 'Emitido' || f.informe === 'Firmado').length} de ${piar.length}`]
  );

  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anio._id, detalle: `Balance anual de inclusión: ${filas.length} expediente(s)`, ip });
  return {
    titulo: 'Balance anual de inclusión',
    institucion: institucion?.nombre ?? '',
    anio: anio.year,
    generado_en: new Date(),
    alcance: describirAlcance(grupos, filtros),
    leyenda: `CONFIDENCIAL: información de estudiantes con necesidades de apoyo. Se calcula al descargar; un ajuste cumple con seguimientos en al menos ${minimo} periodos distintos. No incluye diagnósticos ni categoría de discapacidad.${veModalidad ? '' : ' Su rol no ve la modalidad de cada expediente.'}`,
    resumen,
    columnas: [
      { clave: 'grupo', titulo: 'Grupo', ancho: 9 },
      { clave: 'documento', titulo: 'Documento', ancho: 14, texto: true },
      { clave: 'estudiante', titulo: 'Apellidos y nombres', ancho: 32 },
      ...(veModalidad ? [{ clave: 'modalidad', titulo: 'Modalidad', ancho: 14 }] : []),
      { clave: 'estado', titulo: 'Estado del expediente', ancho: 18 },
      { clave: 'consentimiento', titulo: 'Autorización de datos', ancho: 18 },
      { clave: 'seguimientos', titulo: 'Ajustes con seguimiento mínimo', ancho: 20, alinear: 'center' },
      { clave: 'informe', titulo: 'Informe anual', ancho: 14, alinear: 'center' },
      { clave: 'plazo', titulo: 'Plazo de elaboración', ancho: 14, alinear: 'center' },
    ],
    filas,
    mensaje_vacio: 'No hay expedientes de inclusión en el alcance elegido.',
    nombre_archivo: nombreDeArchivo('balance-inclusion', anio.year, filtros.group_id && grupos.length === 1 ? grupos[0]?.etiqueta : 'todos-los-grupos'),
  };
}
