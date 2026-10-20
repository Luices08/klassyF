import ExcelJS from 'exceljs';
import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import StudentProfile from '../models/studentProfile.model';
import { Titulacion } from '../models/titulacion.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { neutralizarFormula } from '../utils/importacion';
import { evaluarPromocion } from '../utils/promocion';
import { contarReprobadas } from '../utils/recuperaciones';
import { EntradaRevisionSimat, ENCABEZADOS_SIMAT, FilaSimat, RevisionSimat, aCsv, codigoDeGrado, revisarSimat, situacionSimat } from '../utils/simat';
import { describirAlcance, gruposDelAlcance } from './alcanceReportes.service';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { FiltrosListado } from './listadosCierre.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';
import { construirEntradasDelGrupo } from './promocionContexto.service';
import { exentosDelAnio } from './sabanaCalificaciones.service';

export interface ResultadoSimat {
  anio: number;
  alcance: string;
  filas: FilaSimat[];
  revision: RevisionSimat;
}

/** Revisar y descargar es de Secretaría y administración; coordinación solo revisa (ve qué falta, no baja el archivo que se sube al MEN). */
function exigirAcceso(usuario: UserDocument, descarga: boolean): void {
  const permitidos: string[] = descarga ? [ROLES.ADMIN, ROLES.SECRETARIA] : [ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR];
  if (!permitidos.includes(usuario.rol)) throw new ApiError(403, descarga ? 'Solo administración y secretaría descargan la plantilla de SIMAT.' : 'No tienes acceso a la plantilla de SIMAT.');
}

/**
 * Arma el cierre para SIMAT con lo que hoy registran los demás módulos; no guarda nada. Una fila por estudiante con matrícula activa o retirada en el año,
 * de todos los grados y grupos del alcance. La situación es la del cierre de promoción oficial (M19); sin él es una proyección y la revisión lo avisa.
 * Los cuatro campos del nombre salen de la ficha del estudiante (M03) tal como se escribieron: nunca se parten a la fuerza.
 */
export async function armarSimat(filtros: FiltrosListado, usuario: UserDocument, opciones: { descarga: boolean }, ip?: string | null): Promise<ResultadoSimat> {
  exigirAcceso(usuario, opciones.descarga);
  const anio = await cargarAnio(filtros.academic_year_id);
  const grupos = await gruposDelAlcance(anio._id, filtros, usuario);
  const politica = datosDePolitica(await obtenerPolitica(filtros.academic_year_id));
  const exentos = await exentosDelAnio(anio._id);
  const sedes = await Campus.find({ _id: { $in: grupos.map((g) => g.sede_id) } }).select('codigo_dane_sede').lean();
  const daneDeSede = new Map(sedes.map((s) => [String(s._id), s.codigo_dane_sede ?? '']));

  interface Candidato {
    student_id: string;
    grupo: (typeof grupos)[number];
    retirado: boolean;
    reprobadas: number;
    resultado: string | null;
    oficial: boolean;
  }
  const porEstudiante = new Map<string, Candidato>();

  for (const grupo of grupos) {
    const entradas = await construirEntradasDelGrupo(anio, grupo, 'CIERRE');
    const cierres = new Map(
      (await EvaluacionPromocion.find({ academic_year_id: anio._id, group_id: grupo._id, vigente: true }).select('student_id resultado').lean()).map((c) => [String(c.student_id), c.resultado as string])
    );
    for (const e of entradas) {
      const oficial = cierres.get(e.student_id);
      const reprobadas = contarReprobadas(
        e.entrada.asignaturas.map((a) => ({ nota: a.nota_final, exenta: anio.periodos.every((p) => exentos.get(`${e.student_id}|${a.subject_id}`)?.has(p.numero)) })),
        e.entrada.nota_aprobatoria
      );
      porEstudiante.set(e.student_id, { student_id: e.student_id, grupo, retirado: false, reprobadas, resultado: oficial ?? evaluarPromocion(e.entrada, politica, 'CIERRE').resultado, oficial: Boolean(oficial) });
    }
    // Quien se retiró durante el año va en el archivo como «D»; si además tiene una matrícula viva, esa manda.
    const retirados = await Enrollment.find({ academic_year_id: anio._id, group_id: grupo._id, estado: 'RETIRADO' }).select('student_id').lean();
    for (const m of retirados) {
      const id = String(m.student_id);
      if (!porEstudiante.has(id)) porEstudiante.set(id, { student_id: id, grupo, retirado: true, reprobadas: 0, resultado: null, oficial: true });
    }
  }

  const ids = [...porEstudiante.keys()];
  const [usuarios, perfiles, titulaciones] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('nombre apellido tipo_documento numero_documento').lean(),
    StudentProfile.find({ user_id: { $in: ids } }).select('user_id primer_nombre segundo_nombre primer_apellido segundo_apellido').lean(),
    Titulacion.find({ academic_year_id: anio._id, student_id: { $in: ids } }).select('student_id estado').lean(),
  ]);
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
  const perfilPor = new Map(perfiles.map((p) => [String(p.user_id), p]));
  const titulacionPor = new Map(titulaciones.map((t) => [String(t.student_id), t.estado as string]));

  const entradas: EntradaRevisionSimat[] = [];
  for (const c of porEstudiante.values()) {
    const u = usuarioPor.get(c.student_id);
    const p = perfilPor.get(c.student_id);
    const titulacion = titulacionPor.get(c.student_id);
    const graduado = titulacion === 'GRADUADO' || titulacion === 'GRADUADO_EXTEMPORANEO';
    const fila: FilaSimat = {
      codigo_dane_sede: daneDeSede.get(String(c.grupo.sede_id)) ?? '',
      anio: anio.year,
      tipo_documento: u?.tipo_documento ?? '',
      numero_documento: u?.numero_documento ?? '',
      primer_apellido: p?.primer_apellido ?? '',
      segundo_apellido: p?.segundo_apellido ?? '',
      primer_nombre: p?.primer_nombre ?? '',
      segundo_nombre: p?.segundo_nombre ?? '',
      grado: codigoDeGrado(c.grupo.gradoNumero),
      grupo: c.grupo.nomenclatura,
      situacion: situacionSimat({ retirado: c.retirado, graduado, resultado: c.resultado }),
      areas_reprobadas: c.reprobadas,
    };
    entradas.push({
      fila,
      etiqueta: `${u ? `${u.apellido} ${u.nombre}` : c.student_id} (${u?.numero_documento ?? ''}) · ${c.grupo.etiqueta}`,
      oficial: c.oficial,
      grado_numero: c.grupo.gradoNumero,
      aprobo_sin_grado: titulacion === 'APROBO_NO_GRADUADO' && !c.retirado,
    });
  }
  entradas.sort((a, b) => a.grado_numero - b.grado_numero || a.fila.grupo.localeCompare(b.fila.grupo, 'es') || a.fila.primer_apellido.localeCompare(b.fila.primer_apellido, 'es') || a.etiqueta.localeCompare(b.etiqueta, 'es'));

  if (opciones.descarga) {
    await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anio._id, detalle: `Plantilla de cierre SIMAT: ${entradas.length} estudiante(s)`, ip });
  }
  return { anio: anio.year, alcance: describirAlcance(grupos, filtros), filas: entradas.map((e) => e.fila), revision: revisarSimat(entradas) };
}

/** Una sola hoja, sin títulos ni totales: encabezados técnicos en la fila 1 y un estudiante por fila. Documento, grado y grupo se guardan como texto (conservan los ceros). */
export async function excelSimat(r: ResultadoSimat): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Klassy';
  const hoja = libro.addWorksheet('SIMAT');
  hoja.addRow([...ENCABEZADOS_SIMAT]).font = { bold: true };
  for (const f of r.filas) {
    hoja.addRow([f.codigo_dane_sede, f.anio, f.tipo_documento, f.numero_documento, neutralizarFormula(f.primer_apellido), neutralizarFormula(f.segundo_apellido), neutralizarFormula(f.primer_nombre), neutralizarFormula(f.segundo_nombre), f.grado, f.grupo, f.situacion, f.areas_reprobadas]);
  }
  [1, 3, 4, 9, 10].forEach((c) => {
    hoja.getColumn(c).numFmt = '@';
  });
  hoja.getColumn(1).width = 18;
  hoja.getColumn(4).width = 18;
  [5, 6, 7, 8].forEach((c) => (hoja.getColumn(c).width = 20));
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombreArchivo: `simat-cierre-${r.anio}.xlsx` };
}

export const csvSimat = (r: ResultadoSimat): { buffer: Buffer; nombreArchivo: string } => ({
  buffer: Buffer.from(
    aCsv(
      r.filas.map((f) => ({ ...f, primer_apellido: neutralizarFormula(f.primer_apellido), segundo_apellido: neutralizarFormula(f.segundo_apellido), primer_nombre: neutralizarFormula(f.primer_nombre), segundo_nombre: neutralizarFormula(f.segundo_nombre) }))
    ),
    'utf8'
  ),
  nombreArchivo: `simat-cierre-${r.anio}.csv`,
});
