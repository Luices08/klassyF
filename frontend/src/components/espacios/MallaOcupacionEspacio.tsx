import { useOcupacionDeEspacio } from '../../hooks/useHorarios';
import { NOMBRES_DIA_SEMANA, type Espacio, type JornadaOperativa } from '../../types/domain';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Badge';
import { ClockIcon } from '../ui/icons';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';

interface MallaOcupacionEspacioProps {
  espacio: Espacio;
  /** Año lectivo cuyo horario (M09) se lee para ver las clases que usan el espacio. */
  anioId: string;
  /** Jornada cuya ocupación se muestra; undefined si la sede aún no tiene jornadas. */
  jornada: JornadaOperativa | undefined;
  /** Abre el editor de franjas de la jornada (Alert de "sin franjas"). */
  onConfigurarFranjas: () => void;
}

/**
 * Malla semanal de ocupación de un espacio en una jornada (M10). Nada está fijo en el código: los días salen de los
 * días hábiles de la jornada (con sábado o domingo si aplica) y las filas son sus franjas reales de clase y descanso
 * (M01), la misma estructura del motor de horarios (M09). Muestra el salón titular de cada grupo y las clases que el
 * horario de M09 (el publicado o, si no hay, el último borrador) asigna a este espacio, p. ej. Educación física en la cancha.
 */
export function MallaOcupacionEspacio({ espacio, anioId, jornada, onConfigurarFranjas }: MallaOcupacionEspacioProps) {
  const ocupacionQuery = useOcupacionDeEspacio(anioId, jornada?._id ?? '', espacio._id);
  if (!jornada) {
    return (
      <Alert tone="info">
        La sede {espacio.sede_id.nombre} aún no tiene jornadas habilitadas. Créalas en Sedes y jornadas para ver la ocupación.
      </Alert>
    );
  }

  if (jornada.franjas.length === 0) {
    return (
      <div className="space-y-3">
        <Alert tone="info">
          La jornada {jornada.nombre} ({jornada.hora_inicio}–{jornada.hora_fin}) aún no tiene franjas horarias. Defínelas o
          cárgalas desde la plantilla institucional: el módulo de horarios (M09) usará esta misma estructura de tiempo.
        </Alert>
        <Button type="button" variant="outline" onClick={onConfigurarFranjas}>
          <ClockIcon className="h-4 w-4" />
          Configurar franjas de la jornada
        </Button>
      </div>
    );
  }

  const dias = [...jornada.dias_habiles].sort((a, b) => a - b);
  const grupos = espacio.grupos_asignados.filter((g) => g.jornada?._id === jornada._id);
  const noOperativo = espacio.estado !== 'DISPONIBLE';
  const horario = ocupacionQuery.data?.horario ?? null;
  const clases = ocupacionQuery.data?.sesiones ?? [];
  // Los periodos del horario son índices entre las franjas de CLASE: el descanso no cuenta.
  const indicePeriodo = new Map<number, number>();
  jornada.franjas.forEach((f, i) => {
    if (f.tipo === 'CLASE') indicePeriodo.set(i, [...indicePeriodo.keys()].length);
  });
  const clasesEn = (dia: number, indiceFranja: number) => {
    const periodo = indicePeriodo.get(indiceFranja);
    return periodo === undefined ? [] : clases.filter((c) => c.dia === dia && periodo >= c.periodo && periodo < c.periodo + c.duracion);
  };
  const sinOcupacion = grupos.length === 0 && clases.length === 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {sinOcupacion
          ? `Sin grupos titulares ni clases del horario en la jornada ${jornada.nombre}: el espacio está libre en todas sus franjas de clase.`
          : 'Franjas ocupadas por el salón titular de cada grupo (en azul) y por las clases que el horario asigna a este espacio.'}
      </p>
      {horario && (
        <Chip tone={horario.estado === 'PUBLICADO' ? 'green' : 'orange'}>
          {horario.estado === 'PUBLICADO' ? `Horario publicado, versión ${horario.version}` : `Borrador del horario, versión ${horario.version} (aún no publicado)`}
        </Chip>
      )}
      {noOperativo && (
        <Chip tone="orange">
          {espacio.estado === 'EN_MANTENIMIENTO' ? 'En mantenimiento' : 'Inactivo'}: no se asigna a nuevos grupos
        </Chip>
      )}
      <Table>
        <TableHead>
          <Th>Franja</Th>
          {dias.map((d) => (
            <Th key={d}>{NOMBRES_DIA_SEMANA[d]}</Th>
          ))}
        </TableHead>
        <TableBody>
          {jornada.franjas.map((franja, i) => (
            <tr key={`${franja.hora_inicio}-${i}`}>
              <Td className="whitespace-nowrap">
                <p className="text-sm font-medium text-ink">{franja.nombre}</p>
                <p className="font-mono text-xs text-muted">
                  {franja.hora_inicio} – {franja.hora_fin}
                </p>
              </Td>
              {franja.tipo === 'DESCANSO' ? (
                <Td colSpan={dias.length} className="bg-soft text-center text-xs text-muted">
                  Descanso
                </Td>
              ) : (
                dias.map((d) => {
                  const delHorario = clasesEn(d, i);
                  return (
                    <Td key={d} className={grupos.length || delHorario.length ? 'bg-primary-soft/40' : ''}>
                      {grupos.length === 0 && delHorario.length === 0 ? (
                        <span className="text-xs text-muted">Libre</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {grupos.map((g) => (
                            <Chip key={g._id} tone="blue">
                              {g.nomenclatura}
                            </Chip>
                          ))}
                          {delHorario.map((c, k) => (
                            <div key={k} className="text-xs leading-snug">
                              <p className="font-medium text-ink">{c.asignatura}</p>
                              <p className="text-muted">{[c.grupo, ...c.docentes].filter(Boolean).join(' · ')}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Td>
                  );
                })
              )}
            </tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
