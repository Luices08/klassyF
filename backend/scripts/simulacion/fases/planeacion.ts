/**
 * Planes de aula de un periodo (M07): cada docente radica uno por asignatura y grado que dicta (no por grupo) y coordinación lo
 * revisa. Lo usan el inicio del año (periodo 1) y cada periodo siguiente.
 */
import { como } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { registro } from '../nucleo/registro';
import { archivoPdf } from '../nucleo/archivos';
import { coordinacion, ContextoFase } from './comun';

interface AsignacionVista {
  docente_id: { _id: string };
  subject_id: { _id: string; nombre: string };
  group_id: { grade_id: { _id: string; nombre: string } };
}

export async function radicarPlanesDeAula(ctx: ContextoFase, anio: number, periodo: number): Promise<void> {
  const anioId = await registro.leer(`anio:${anio}`);
  const coord = como(await coordinacion());
  const { data: asignaciones } = await coord.get<AsignacionVista[]>('/teacher-assignments', { academic_year_id: anioId, tipo_asignacion: 'CLASE', estado: 'activo' });
  const plazaDe = new Map([...(await registro.porPrefijo('usuario:')).entries()].map(([clave, id]) => [id, clave]));

  const planes = new Map<string, AsignacionVista>();
  for (const a of asignaciones) planes.set(`${a.docente_id._id}|${a.subject_id._id}|${a.group_id.grade_id._id}`, a);

  const azar = azarPara(ctx.semilla, 'planes-aula', anio, periodo);
  let devueltos = 0;
  for (const a of planes.values()) {
    const docente = como({ id: a.docente_id._id, rol: 'DOCENTE', etiqueta: `docente ${plazaDe.get(a.docente_id._id) ?? a.docente_id._id}` });
    const nombre = `${a.subject_id.nombre} — ${a.group_id.grade_id.nombre}`;
    const radicar = async (version: number) => {
      const archivo = await archivoPdf(`plan-aula-p${periodo}-v${version}`, `Plan de aula P${periodo} ${anio}: ${nombre}`, ['Desempeños esperados, secuencia de clases, actividades y evaluación del periodo.']);
      const { data } = await docente.subir<{ _id: string }>('/planeacion/planes-aula', archivo, {
        academic_year_id: anioId,
        periodo_numero: String(periodo),
        subject_id: a.subject_id._id,
        grade_id: a.group_id.grade_id._id,
        titulo: `Plan de aula ${nombre}, periodo ${periodo}`,
        descripcion: version === 1 ? 'Planeación del periodo.' : 'Ajustado según la revisión de coordinación.',
      });
      return data._id;
    };
    let planId = await radicar(1);
    if (azar.prob(0.08)) {
      await coord.patch(`/planeacion/planes-aula/${planId}/revision`, { decision: 'DEVUELTO', comentario: 'Falta la relación de las actividades con los criterios de evaluación del SIEE.' });
      planId = await radicar(2);
      devueltos += 1;
    }
    await coord.patch(`/planeacion/planes-aula/${planId}/revision`, { decision: 'APROBADO', comentario: 'Aprobado.' });
  }
  ctx.log(`Planes de aula P${periodo} ${anio}: ${planes.size} aprobados (${devueltos} devueltos una vez).`);
}
