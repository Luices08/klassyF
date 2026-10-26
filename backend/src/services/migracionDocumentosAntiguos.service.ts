import { DOCUMENTOS_QUE_SOLO_PIDE_EL_INGRESO_NUEVO, INGRESO_NUEVO } from '../constants/requisitosDocumentales';
import Enrollment from '../models/enrollment.model';
import RequisitoDocumental from '../models/requisitoDocumental.model';
import { checklistCompleto } from '../utils/documentosMatricula';
import { asegurarCatalogoSembrado } from './requisitoDocumental.service';

/**
 * Los colegios que ya tenían el catálogo sembrado piden identidad, foto, EPS, documento del acudiente y diagnóstico de inclusión también a los
 * antiguos (así se sembró antes). Esta adaptación restringe esos documentos al ingreso nuevo y al traslado, **solo si el colegio no los había
 * personalizado** (los que ya tienen tipos de ingreso marcados se respetan) y nunca toca una matrícula salvo que se pida.
 */
export type AccionSobreRequisito = 'ACTUALIZAR' | 'YA_ESTABA' | 'PERSONALIZADO' | 'NO_EXISTE';

export interface ResultadoAdaptacion {
  aplicado: boolean;
  requisitos: Array<{ clave: string; accion: AccionSobreRequisito }>;
  matriculas: {
    /** Pre-matrículas o condicionales de antiguos o repitentes con alguno de esos documentos aún pendiente y sin archivo. */
    con_pendientes: number;
    items_retirados: number;
    /** Condicionales que, sin esos pendientes, ya tienen todo lo obligatorio y pasan a definitivas. */
    pasan_a_definitiva: number;
  };
}

const mismoConjunto = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && b.every((x) => a.includes(x));

export async function adaptarDocumentosDeAntiguos(opciones: { aplicar: boolean; limpiar_matriculas: boolean }): Promise<ResultadoAdaptacion> {
  await asegurarCatalogoSembrado();

  const requisitos: ResultadoAdaptacion['requisitos'] = [];
  for (const clave of DOCUMENTOS_QUE_SOLO_PIDE_EL_INGRESO_NUEVO) {
    const requisito = await RequisitoDocumental.findOne({ clave });
    if (!requisito) {
      requisitos.push({ clave, accion: 'NO_EXISTE' });
    } else if (requisito.tipos_ingreso.length === 0) {
      if (opciones.aplicar) {
        requisito.tipos_ingreso = [...INGRESO_NUEVO];
        await requisito.save();
      }
      requisitos.push({ clave, accion: 'ACTUALIZAR' });
    } else {
      requisitos.push({ clave, accion: mismoConjunto(requisito.tipos_ingreso, INGRESO_NUEVO) ? 'YA_ESTABA' : 'PERSONALIZADO' });
    }
  }

  const matriculas = { con_pendientes: 0, items_retirados: 0, pasan_a_definitiva: 0 };
  // Solo se limpian los documentos que el catálogo ya no le pide a un antiguo (si el colegio personalizó uno, se sigue pidiendo).
  const restringidos = requisitos.filter((r) => r.accion === 'ACTUALIZAR' || r.accion === 'YA_ESTABA').map((r) => r.clave);
  if (opciones.limpiar_matriculas && restringidos.length > 0) {
    const pendiente = { tipo_documento: { $in: restringidos }, estado: 'PENDIENTE', archivo_path: null };
    const candidatas = await Enrollment.find({
      estado: { $in: ['PREINSCRITO', 'MATRICULADO_CONDICIONAL'] },
      tipo_ingreso: { $in: ['ANTIGUO', 'REPITENTE'] },
      checklist: { $elemMatch: pendiente },
    });
    for (const m of candidatas) {
      // Lo subido o aprobado nunca se retira: solo lo que nadie entregó.
      const retirables = m.checklist.filter((c) => restringidos.includes(c.tipo_documento) && c.estado === 'PENDIENTE' && !c.archivo_path);
      if (retirables.length === 0) continue;
      const quedan = m.checklist.filter((c) => !retirables.includes(c));
      const pasaADefinitiva = m.estado === 'MATRICULADO_CONDICIONAL' && checklistCompleto(quedan);
      matriculas.con_pendientes += 1;
      matriculas.items_retirados += retirables.length;
      if (pasaADefinitiva) matriculas.pasan_a_definitiva += 1;
      if (opciones.aplicar) {
        await Enrollment.updateOne(
          { _id: m._id },
          { $pull: { checklist: pendiente }, ...(pasaADefinitiva ? { $set: { estado: 'MATRICULADO_DEFINITIVO', fecha_limite_compromiso: null } } : {}) }
        );
      }
    }
  }

  return { aplicado: opciones.aplicar, requisitos, matriculas };
}
