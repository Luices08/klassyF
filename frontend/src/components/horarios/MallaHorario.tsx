import { Fragment } from 'react';
import { NOMBRES_DIA_SEMANA } from '../../types/domain';
import type { CatalogoHorario, EstructuraSemana, SesionHorario } from '../../types/horarios';
import { LockIcon } from '../ui/icons';

export type VistaHorario = 'GRUPO' | 'DOCENTE' | 'GENERAL';

interface MallaHorarioProps {
  estructura: EstructuraSemana;
  sesiones: SesionHorario[];
  catalogo: CatalogoHorario;
  vista: VistaHorario;
  /** Grupo o docente que se muestra en las vistas GRUPO y DOCENTE. */
  entidadId: string;
  /** Claves de sesión implicadas en un conflicto duro: se resaltan en rojo. */
  enConflicto: Set<string>;
  /** Solo en borradores: clic en una sesión la selecciona; clic en una franja libre la mueve ahí. */
  edicion?: {
    seleccionadaId: string | null;
    onSeleccionar: (sesion: SesionHorario | null) => void;
    onDestino: (dia: number, periodo: number) => void;
    /** Clic en otra sesión de igual duración, con una ya seleccionada: se intercambian. */
    onIntercambiar: (sesion: SesionHorario) => void;
    ocupado: boolean;
  };
}

function useNombres(catalogo: CatalogoHorario) {
  const asignatura = new Map(catalogo.asignaturas.map((s) => [s._id, s]));
  const grupo = new Map(catalogo.grupos.map((g) => [g._id, g.etiqueta]));
  const grupoCorto = new Map(catalogo.grupos.map((g) => [g._id, g.etiqueta_corta]));
  const docente = new Map(catalogo.docentes.map((d) => [d._id, d.nombre]));
  const espacio = new Map(catalogo.espacios.map((e) => [e._id, e.nombre]));
  const reunion = new Map(catalogo.reuniones.map((r) => [r._id, r.nombre]));
  return {
    titulo: (s: SesionHorario) =>
      s.subject_id ? (asignatura.get(s.subject_id)?.nombre ?? 'Asignatura') : (reunion.get(s.reunion_variable_id ?? '') ?? 'Reunión'),
    corto: (s: SesionHorario) =>
      s.subject_id ? (asignatura.get(s.subject_id)?.abreviatura ?? '—') : (reunion.get(s.reunion_variable_id ?? '') ?? 'Reunión'),
    grupo: (id: string | null) => (id ? (grupo.get(id) ?? '') : ''),
    grupoCorto: (id: string | null) => (id ? (grupoCorto.get(id) ?? '') : ''),
    docentes: (s: SesionHorario) => s.docente_ids.map((d) => docente.get(d) ?? '').join(', '),
    espacio: (id: string | null) => (id ? (espacio.get(id) ?? '') : ''),
  };
}

const celdaBase = 'rounded-md px-2 py-1.5 text-left text-xs leading-tight';
const tono = (conflicto: boolean, reunion: boolean) =>
  conflicto ? 'bg-danger-soft text-danger ring-1 ring-danger/40' : reunion ? 'bg-warning-soft text-ink' : 'bg-primary-soft text-ink';

/**
 * Horario de un grupo o de un docente: periodos de la jornada en filas y días hábiles en columnas, con los bloques de
 * varias horas en una sola celda alta. La vista GENERAL es la "sábana": un docente por fila y cada día × periodo en
 * columnas, con el grupo que atiende.
 */
export function MallaHorario({ estructura, sesiones, catalogo, vista, entidadId, enConflicto, edicion }: MallaHorarioProps) {
  const nombres = useNombres(catalogo);
  if (vista === 'GENERAL') return <Sabana estructura={estructura} sesiones={sesiones} catalogo={catalogo} enConflicto={enConflicto} nombres={nombres} />;

  const propias = sesiones.filter((s) => (vista === 'GRUPO' ? s.group_id === entidadId : s.docente_ids.includes(entidadId)));
  const duracionSeleccionada = edicion?.seleccionadaId ? sesiones.find((s) => s._id === edicion.seleccionadaId)?.duracion : undefined;
  const inicioEn = new Map<string, SesionHorario[]>();
  const cubierta = new Set<string>();
  for (const s of propias) {
    const clave = `${s.dia}-${s.periodo}`;
    inicioEn.set(clave, [...(inicioEn.get(clave) ?? []), s]);
    for (let k = 1; k < s.duracion; k += 1) cubierta.add(`${s.dia}-${s.periodo + k}`);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-primary-soft">
            <th className="w-32 px-3 py-2 text-left text-label text-body">Periodo</th>
            {estructura.dias.map((d) => (
              <th key={d} className="px-2 py-2 text-left text-label text-body">
                {NOMBRES_DIA_SEMANA[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estructura.periodos.map((p, periodo) => (
            <Fragment key={periodo}>
              {p.descanso_antes && (
                <tr>
                  <td colSpan={estructura.dias.length + 1} className="bg-soft py-1 text-center text-xs text-muted">
                    Descanso
                  </td>
                </tr>
              )}
              <tr className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <p className="font-medium text-ink">{p.nombre}</p>
                  <p className="font-mono text-xs text-muted">
                    {p.hora_inicio} – {p.hora_fin}
                  </p>
                </td>
                {estructura.dias.map((d) => {
                  const clave = `${d}-${periodo}`;
                  if (cubierta.has(clave) && !inicioEn.has(clave)) return null;
                  const aqui = inicioEn.get(clave) ?? [];
                  const alto = Math.max(1, ...aqui.map((s) => s.duracion));
                  const destinoLibre = edicion?.seleccionadaId && aqui.length === 0 && !cubierta.has(clave);
                  return (
                    <td key={d} rowSpan={alto} className="h-px p-1">
                      <div className="flex h-full flex-col gap-1">
                        {aqui.map((s) => {
                          const seleccionada = edicion?.seleccionadaId === s._id;
                          const intercambiable = duracionSeleccionada !== undefined && !seleccionada && s.duracion === duracionSeleccionada;
                          const contenido = (
                            <>
                              <p className="font-semibold">
                                {nombres.titulo(s)}
                                {s.duracion > 1 && <span className="ml-1 font-normal text-muted">· {s.duracion} h</span>}
                                {edicion && s.fija && <LockIcon className="ml-1 inline h-3 w-3 text-muted" aria-label="Fija" />}
                              </p>
                              <p className="text-muted">{vista === 'GRUPO' ? nombres.docentes(s) : nombres.grupo(s.group_id) || 'Sin grupo'}</p>
                              {s.espacio_id && <p className="text-muted">{nombres.espacio(s.espacio_id)}</p>}
                            </>
                          );
                          const clases = `${celdaBase} flex-1 ${tono(enConflicto.has(s.clave), !s.subject_id)} ${seleccionada ? 'ring-2 ring-primary' : intercambiable ? 'outline-dashed outline-1 outline-primary/60' : ''}`;
                          return edicion ? (
                            <button
                              key={s._id}
                              type="button"
                              disabled={edicion.ocupado}
                              onClick={() => (intercambiable ? edicion.onIntercambiar(s) : edicion.onSeleccionar(seleccionada ? null : s))}
                              className={`${clases} flex w-full flex-col items-start justify-start hover:ring-1 hover:ring-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
                              title={seleccionada ? 'Clic para soltar la selección' : intercambiable ? 'Clic para intercambiar con la seleccionada' : 'Clic para seleccionar y mover'}
                            >
                              {contenido}
                            </button>
                          ) : (
                            <div key={s._id} className={clases} title={nombres.titulo(s)}>
                              {contenido}
                            </div>
                          );
                        })}
                        {destinoLibre && (
                          <button
                            type="button"
                            disabled={edicion.ocupado}
                            onClick={() => edicion.onDestino(d, periodo)}
                            className="flex min-h-10 flex-1 items-center justify-center rounded-md border border-dashed border-primary/40 text-xs font-medium text-primary hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            Mover aquí
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sabana({
  estructura,
  sesiones,
  catalogo,
  enConflicto,
  nombres,
}: Omit<MallaHorarioProps, 'vista' | 'entidadId'> & { nombres: ReturnType<typeof useNombres> }) {
  // docente → "dia-periodo" → sesiones que lo ocupan (contando todas las horas del bloque)
  const ocupacion = new Map<string, Map<string, SesionHorario[]>>();
  for (const s of sesiones) {
    for (const d of s.docente_ids) {
      const delDocente = ocupacion.get(d) ?? new Map<string, SesionHorario[]>();
      for (let k = 0; k < s.duracion; k += 1) {
        const clave = `${s.dia}-${s.periodo + k}`;
        delDocente.set(clave, [...(delDocente.get(clave) ?? []), s]);
      }
      ocupacion.set(d, delDocente);
    }
  }

  // Línea entre días y un espacio en el descanso, como en la sábana impresa.
  const separador = (p: number) => (p === 0 ? 'border-l border-border' : estructura.periodos[p]?.descanso_antes ? 'border-l-4 border-soft' : '');

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="border-collapse text-xs">
        <thead>
          <tr className="bg-primary-soft">
            <th rowSpan={2} className="sticky left-0 z-10 bg-primary-soft px-3 py-2 text-left text-label text-body">
              Docente
            </th>
            {estructura.dias.map((d) => (
              <th key={d} colSpan={estructura.periodos.length} className="border-l border-border px-2 py-1 text-center text-label text-body">
                {NOMBRES_DIA_SEMANA[d]}
              </th>
            ))}
          </tr>
          <tr className="bg-primary-soft">
            {estructura.dias.map((d) =>
              estructura.periodos.map((_, p) => (
                <th key={`${d}-${p}`} className={`w-12 px-1 pb-1 text-center font-normal text-muted ${separador(p)}`}>
                  {p + 1}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {catalogo.docentes.map((doc) => (
            <tr key={doc._id} className="border-t border-border">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1 font-medium text-ink">{doc.nombre}</td>
              {estructura.dias.map((d) =>
                estructura.periodos.map((_, p) => {
                  const aqui = ocupacion.get(doc._id)?.get(`${d}-${p}`) ?? [];
                  const conflicto = aqui.length > 1 || aqui.some((s) => enConflicto.has(s.clave));
                  return (
                    <td key={`${d}-${p}`} className={`px-0.5 py-0.5 text-center ${separador(p)}`}>
                      {aqui.length > 0 && (
                        <div
                          className={`rounded px-1 py-1 ${tono(conflicto, aqui.every((s) => !s.subject_id))}`}
                          title={aqui.map((s) => `${nombres.titulo(s)} · ${nombres.grupo(s.group_id) || 'sin grupo'}`).join('\n')}
                        >
                          {aqui.map((s) => (s.group_id ? nombres.grupoCorto(s.group_id) : nombres.corto(s))).join(' / ')}
                        </div>
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
