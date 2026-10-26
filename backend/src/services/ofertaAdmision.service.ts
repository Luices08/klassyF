import AcademicYear from '../models/academicYear.model';
import Campus from '../models/campus.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { motivoDeOfertaNoDisponible, OpcionDeOferta, PedidoDeCupo } from '../utils/ofertaDeAdmision';
import { anioDeLaAdmision } from './prematricula.service';

/**
 * La oferta de admisión (M04): qué grados hay en qué sedes y jornadas, según los grupos activos del año al que apunta una solicitud nueva (el siguiente si la
 * ventana de prematrícula está abierta, o el año en curso). Si ese año todavía no tiene grupos se usa el año sin cerrar más reciente que sí los tenga, para
 * que el formulario no quede vacío mientras el colegio crea los grupos. Sin cupos: la familia solo ve qué se ofrece, no cuánto queda.
 */

export interface OfertaDeAdmision {
  anio: { id: string; year: number } | null;
  oferta: Array<{
    grado: { id: string; nombre: string; numero: number };
    sede: { id: string; nombre: string };
    jornada: string;
  }>;
}

async function gruposActivosDelAnioDeAdmision() {
  const preferido = await anioDeLaAdmision();
  const candidatos = preferido ? [preferido] : [];
  const otros = await AcademicYear.find({ estado: { $ne: 'CERRADO' }, ...(preferido ? { _id: { $ne: preferido } } : {}) }).sort({ year: -1, createdAt: -1 }).select('_id');
  for (const id of [...candidatos, ...otros.map((a) => a._id)]) {
    const grupos = await Group.find({ academic_year_id: id, estado: 'ACTIVE' }).select('grade_id sede_id jornada_id').lean();
    if (grupos.length > 0) return { anioId: id, grupos };
  }
  return { anioId: preferido, grupos: [] };
}

export async function ofertaDeAdmision(): Promise<OfertaDeAdmision> {
  const { anioId, grupos } = await gruposActivosDelAnioDeAdmision();
  const [anio, grados, sedes, jornadas] = await Promise.all([
    anioId ? AcademicYear.findById(anioId).select('year') : null,
    Grade.find({ estado: ESTADO_ACTIVO }).select('nombre numero').lean(),
    Campus.find({ estado: ESTADO_ACTIVO }).select('nombre').lean(),
    JornadaOperativa.find({ _id: { $in: grupos.map((g) => g.jornada_id).filter(Boolean) } }).select('nombre').lean(),
  ]);
  const grado = new Map(grados.map((g) => [String(g._id), g]));
  const sede = new Map(sedes.map((s) => [String(s._id), s]));
  const jornada = new Map(jornadas.map((j) => [String(j._id), j.nombre]));

  const vistos = new Set<string>();
  const oferta: OfertaDeAdmision['oferta'] = [];
  for (const g of grupos) {
    const gr = grado.get(String(g.grade_id));
    const se = sede.get(String(g.sede_id));
    const jo = g.jornada_id ? jornada.get(String(g.jornada_id)) : undefined;
    if (!gr || !se || !jo) continue;
    const clave = `${gr._id}|${se._id}|${jo}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    oferta.push({ grado: { id: String(gr._id), nombre: gr.nombre, numero: gr.numero }, sede: { id: String(se._id), nombre: se.nombre }, jornada: jo });
  }
  oferta.sort((a, b) => a.grado.numero - b.grado.numero || a.sede.nombre.localeCompare(b.sede.nombre, 'es') || a.jornada.localeCompare(b.jornada));
  return { anio: anio ? { id: String(anio._id), year: anio.year } : null, oferta };
}

/** Rechaza (400) un pedido de cupo que el colegio no ofrece. Lo usan la solicitud pública y la inscripción en el mostrador: nadie radica algo que luego haya que rechazar. */
export async function exigirOfertaDisponible(pedido: PedidoDeCupo): Promise<void> {
  const { oferta } = await ofertaDeAdmision();
  const opciones: OpcionDeOferta[] = oferta.map((o) => ({ grado_id: o.grado.id, sede_id: o.sede.id, jornada: o.jornada }));
  const motivo = motivoDeOfertaNoDisponible(opciones, pedido);
  if (motivo) throw new ApiError(400, motivo);
}
