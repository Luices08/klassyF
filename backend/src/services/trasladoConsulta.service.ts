import { Types } from 'mongoose';
import NotaHomologada, { INotaHomologada } from '../models/notaHomologada.model';
import TrasladoExtemporaneo, { ITrasladoExtemporaneo } from '../models/trasladoExtemporaneo.model';

/**
 * Lo que de los traslados leen los demás módulos (M12 planilla, M17 boletín, M18 recuperaciones, M26 certificados). Solo consulta: no
 * importa servicios, así cualquiera lo usa sin ciclos.
 */

type Id = Types.ObjectId | string;

/**
 * Estudiantes del año que ingresaron DESPUÉS de este periodo: no lo cursaron aquí, así que ningún docente los califica en él (sus notas son
 * las homologadas que registra secretaría).
 */
export async function ingresaronDespuesDe(anioId: Id, periodoNumero: number): Promise<Set<string>> {
  const ids = await TrasladoExtemporaneo.find({ academic_year_id: anioId, periodo_ingreso: { $gt: periodoNumero } }).distinct('student_id');
  return new Set(ids.map(String));
}

export type NotaHomologadaPlana = INotaHomologada & { _id: Types.ObjectId };

/** Las notas homologadas o exentas de un periodo, por `${asignatura}|${estudiante}`. */
export async function homologadasDelPeriodo(anioId: Id, periodoNumero: number, estudiantes: readonly string[]): Promise<Map<string, NotaHomologadaPlana>> {
  if (estudiantes.length === 0) return new Map();
  const notas = await NotaHomologada.find({ academic_year_id: anioId, periodo_numero: periodoNumero, student_id: { $in: estudiantes } }).lean<NotaHomologadaPlana[]>();
  return new Map(notas.map((n) => [`${String(n.subject_id)}|${String(n.student_id)}`, n]));
}

export type TrasladoPlano = ITrasladoExtemporaneo & { _id: Types.ObjectId };

export async function trasladosDeEstudiantes(anioId: Id, estudiantes: readonly string[]): Promise<Map<string, TrasladoPlano>> {
  if (estudiantes.length === 0) return new Map();
  const traslados = await TrasladoExtemporaneo.find({ academic_year_id: anioId, student_id: { $in: estudiantes } }).lean<TrasladoPlano[]>();
  return new Map(traslados.map((t) => [String(t.student_id), t]));
}

/** Cómo se explica en el boletín de dónde salió una nota homologada («Trimestre 1: 8,5 (Escala 1 a 10) → 4.2»). */
export function detalleDeHomologacion(nota: Pick<INotaHomologada, 'estado' | 'fuentes' | 'nota' | 'motivo' | 'asignatura_origen'>): string {
  if (nota.estado === 'EXENTA_POR_TRASLADO') return nota.motivo;
  const fuentes = nota.fuentes
    .map((f) => `${f.periodo_origen}: ${f.valor_original}${f.escala.tipo === 'INSTITUCIONAL' ? '' : ` (${f.escala.nombre})`}${nota.fuentes.length > 1 ? ` · ${f.peso}%` : ''}`)
    .join('; ');
  const origen = nota.asignatura_origen ? ` Asignatura en origen: ${nota.asignatura_origen}.` : '';
  return `${fuentes} → ${nota.nota}.${origen}`;
}
