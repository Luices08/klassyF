/**
 * Fase «cierre de año»: con el último periodo cerrado, el ADMIN cierra la promoción de cada grupo (quien perdió una asignatura queda
 * pendiente de recuperación; quien perdió dos o más, no se promueve), los docentes toman la recuperación final, secretaría confirma
 * el paz y salvo, el ADMIN cierra de nuevo la promoción de quienes recuperaron y, verificado todo, cierra el año lectivo con su
 * contraseña. Cada paso es una llamada a la API en su fecha.
 */
import { como, ErrorApi } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { perfiles, registro } from '../nucleo/registro';
import { aLaHora, diaDelAnio, isoDia, sumarDias } from '../nucleo/fechas';
import { intentoDeRecuperacion, nivelEsperado } from '../logica/notas';
import { confirmaPazYSalvo } from '../logica/trayectoria';
import { Latentes } from '../logica/perfiles';
import { admin, coordinacion, ContextoFase, ejecutarEventos, Evento, secretaria } from './comun';
import { grupoClave } from './prepararAnio';
import { matriculasActivas } from './vidaEscolar';

interface AsignacionVista {
  _id: string;
  docente_id: { _id: string };
  subject_id: { _id: string };
}

interface ResumenCierre {
  cerrados: number;
  omitidos: number;
  por_resultado: Record<string, number>;
  bloqueados: unknown[];
}

interface Verificacion {
  puede_cerrar: boolean;
  verificaciones: Array<{ clave: string; cumple: boolean; detalle: string | null }>;
}

const sumar = (total: Record<string, number>, parcial: Record<string, number>) => {
  for (const [k, v] of Object.entries(parcial)) total[k] = (total[k] ?? 0) + v;
};

export async function faseCierreAnio(ctx: ContextoFase, anio: number): Promise<void> {
  const { config } = ctx;
  const anioId = await registro.leer(`anio:${anio}`);
  const adminApi = como(await admin());
  const secre = como(await secretaria());
  const coord = como(await coordinacion());
  const rf = config.calendario.recuperacion_final;
  const periodos = config.calendario.periodos;
  const ultimo = periodos[periodos.length - 1];
  if (!ultimo) throw new Error('La configuración no tiene periodos.');
  const cierreUltimo = sumarDias(diaDelAnio(anio, ultimo.fin), config.calendario.recuperacion_periodo.dias_limite_despues_del_fin + 1);
  const inicioRecuperacion = diaDelAnio(anio, rf.inicio);
  const finRecuperacion = diaDelAnio(anio, rf.fin);
  const limiteResultados = diaDelAnio(anio, rf.limite_resultados);
  const grupos = await Promise.all(config.grupos.flatMap((g) => g.nomenclaturas).map(async (n) => ({ nomenclatura: n, id: await registro.leer(grupoClave(anio, n)) })));

  const cerrarPromocion = async (momento: 'CIERRE' | 'TRAS_RECUPERACION'): Promise<void> => {
    const total: Record<string, number> = {};
    let cerrados = 0;
    for (const g of grupos) {
      const { data } = await adminApi.post<ResumenCierre>('/promocion/cierre', { academic_year_id: anioId, group_id: g.id, momento, confirm_password: ctx.claveAdmin });
      cerrados += data.cerrados;
      sumar(total, data.por_resultado);
      if (data.bloqueados.length > 0) ctx.log(`Grupo ${g.nomenclatura}: ${data.bloqueados.length} estudiantes con nivelación pendiente.`);
    }
    const detalle = Object.entries(total)
      .map(([r, n]) => `${n} ${r}`)
      .join(', ');
    ctx.log(`Promoción ${anio} (${momento}): ${cerrados} cerrados${detalle ? ` — ${detalle}` : ''}.`);
  };

  // 1. Cierre de la promoción: ya están todas las notas del año.
  const eventos: Evento[] = [{ cuando: aLaHora(cierreUltimo, '14:00'), correr: () => cerrarPromocion('CIERRE') }];

  // 2. Recuperación final: cada docente toma la de sus asignaturas (solo la presentan quienes perdieron una).
  const { data: asignaciones } = await coord.get<AsignacionVista[]>('/teacher-assignments', { academic_year_id: anioId, tipo_asignacion: 'CLASE', estado: 'activo' });
  const claveDeAsignatura = new Map([...(await registro.porPrefijo('asignatura:')).entries()].map(([clave, id]) => [id, clave]));
  const tipos = new Map(config.areas.flatMap((a) => a.asignaturas.map((s) => [s.clave, s.tipo_nota] as const)));
  const latentes = new Map((await perfiles.todos()).flatMap((p) => p.por_anio.filter((x) => x.anio === anio).map((x) => [p.student_id, { categoria: x.categoria, latentes: x.latentes as unknown as Latentes }] as const)));
  const recuperacion = { candidatos: 0, presentadas: 0, superadas: 0 };
  const primerDia = new Date(Math.max(inicioRecuperacion.getTime(), sumarDias(cierreUltimo, 1).getTime()));
  const dias = Math.max(0, Math.round((finRecuperacion.getTime() - primerDia.getTime()) / 86_400_000));
  for (const a of asignaciones) {
    const azarClase = azarPara(ctx.semilla, 'recuperacion-final-dia', anio, a._id);
    const docente = como({ id: a.docente_id._id, rol: 'DOCENTE', etiqueta: `docente ${a.docente_id._id}` });
    const clave = claveDeAsignatura.get(a.subject_id._id) ?? '';
    eventos.push({
      cuando: aLaHora(sumarDias(primerDia, azarClase.entero(0, dias)), `${String(azarClase.entero(7, 16)).padStart(2, '0')}:10`),
      correr: async () => {
        const { data } = await docente.get<{ aplica: boolean; filas: Array<{ estudiante: { _id: string }; estado: string; habilitado: boolean }> }>('/recuperaciones', {
          academic_year_id: anioId,
          tipo: 'ANUAL',
          teacher_assignment_id: a._id,
        });
        if (!data.aplica) return;
        for (const fila of data.filas.filter((f) => f.habilitado && f.estado === 'PENDIENTE')) {
          recuperacion.candidatos += 1;
          const perfil = latentes.get(fila.estudiante._id);
          if (!perfil) continue;
          const esperado = nivelEsperado(perfil, clave, tipos.get(clave) ?? 'MODERADA', 4);
          const nota = intentoDeRecuperacion(esperado, perfil.latentes, azarPara(ctx.semilla, 'recuperacion-final', anio, a._id, fila.estudiante._id));
          if (nota === null) continue;
          await docente.post('/recuperaciones/intentos', { teacher_assignment_id: a._id, student_id: fila.estudiante._id, tipo: 'ANUAL', nota, observacion: 'Recuperación de fin de año: taller y sustentación.' });
          recuperacion.presentadas += 1;
          if (nota >= config.escala.aprobatoria) recuperacion.superadas += 1;
        }
      },
    });
  }

  // 3. Paz y salvo de fin de año: secretaría lo confirma antes de la matrícula del año siguiente (unos pocos quedan con algo pendiente).
  const activos = await matriculasActivas(ctx, anio);
  let pazConfirmados = 0;
  for (const m of activos) {
    const azar = azarPara(ctx.semilla, 'paz-y-salvo', anio, m.student_id);
    // Quien termina 11° necesita su paz y salvo para graduarse: se confirma antes de cerrar la promoción, el mismo día.
    const cuando = m.grado === 11 ? aLaHora(cierreUltimo, `${String(azar.entero(8, 12)).padStart(2, '0')}:${String(azar.entero(0, 59)).padStart(2, '0')}`) : aLaHora(sumarDias(finRecuperacion, azar.entero(-1, 3)), `${String(azar.entero(8, 16)).padStart(2, '0')}:${String(azar.entero(0, 59)).padStart(2, '0')}`);
    eventos.push({
      cuando,
      correr: async () => {
        if (!confirmaPazYSalvo(azar)) return;
        // Al retomar una fase que quedó a medias, el paz y salvo puede estar ya confirmado: se cuenta y se sigue.
        await secre.patch(`/paz-y-salvo/estudiantes/${m.student_id}/anios/${anioId}`, { estado: 'CONFIRMADO' }).catch((error: unknown) => {
          if (!(error instanceof ErrorApi && error.status === 400 && /ya está confirmado/i.test(error.message))) throw error;
        });
        pazConfirmados += 1;
      },
    });
  }

  // 4. Cierre definitivo de los grupos con las recuperaciones ya presentadas, y cierre del año lectivo.
  eventos.push({ cuando: aLaHora(sumarDias(limiteResultados, 1), '10:00'), correr: () => cerrarPromocion('TRAS_RECUPERACION') });
  eventos.push({
    cuando: aLaHora(sumarDias(limiteResultados, 3), '09:00'),
    correr: async () => {
      const { data: verificacion } = await adminApi.get<Verificacion>(`/academic-years/${anioId}/cierre`);
      const faltan = verificacion.verificaciones.filter((v) => !v.cumple);
      if (!verificacion.puede_cerrar) throw new Error(`El año ${anio} no se puede cerrar: ${faltan.map((v) => `${v.clave}: ${v.detalle ?? ''}`).join(' | ')}`);
      await adminApi.post(`/academic-years/${anioId}/cerrar`, { confirm_password: ctx.claveAdmin, confirmar_year: anio });
      ctx.log(`Año ${anio} cerrado el ${isoDia(sumarDias(limiteResultados, 3))}.`);
    },
  });

  const omitidos = await ejecutarEventos(eventos, [], ctx);
  if (omitidos > 0) {
    ctx.log(`Cierre ${anio}: ${omitidos} pasos quedan después del corte.`);
    return;
  }
  ctx.log(`Recuperación final ${anio}: ${recuperacion.candidatos} pendientes, ${recuperacion.presentadas} presentadas, ${recuperacion.superadas} superadas. Paz y salvo confirmado a ${pazConfirmados} de ${activos.length}.`);
  const { data: titulaciones } = await adminApi.get<Array<{ estado: string }>>('/titulacion', { academic_year_id: anioId });
  const porEstado: Record<string, number> = {};
  for (const t of Array.isArray(titulaciones) ? titulaciones : []) porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
  ctx.log(`Titulación ${anio}: ${Object.entries(porEstado).map(([e, n]) => `${n} ${e}`).join(', ') || 'ninguna'}.`);
}

