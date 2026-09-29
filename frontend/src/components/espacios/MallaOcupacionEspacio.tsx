import { NOMBRES_DIA_SEMANA, type Espacio, type JornadaOperativa } from '../../types/domain';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Badge';
import { ClockIcon } from '../ui/icons';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';

interface MallaOcupacionEspacioProps {
  espacio: Espacio;
  /** Jornada cuya ocupación se muestra; undefined si la sede aún no tiene jornadas. */
  jornada: JornadaOperativa | undefined;
  /** Abre el editor de franjas de la jornada (Alert de "sin franjas"). */
  onConfigurarFranjas: () => void;
}

/**
 * Malla semanal de ocupación de un espacio en una jornada (M10). Nada está fijo en el código: los días salen de los
 * días hábiles de la jornada (con sábado o domingo si aplica) y las filas son sus franjas reales de clase y descanso
 * (M01), la misma estructura que usará el motor de horarios (M09). Hoy solo hay ocupación por salón titular; la de
 * cada asignatura llegará con M09.
 */
export function MallaOcupacionEspacio({ espacio, jornada, onConfigurarFranjas }: MallaOcupacionEspacioProps) {
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

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {grupos.length === 0
          ? `Sin grupos titulares en la jornada ${jornada.nombre}: el espacio está libre en todas sus franjas de clase.`
          : 'Franjas de clase ocupadas por el salón titular de cada grupo. La ocupación por asignatura llegará con el motor de horarios (M09).'}
      </p>
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
                dias.map((d) => (
                  <Td key={d} className={grupos.length ? 'bg-primary-soft/40' : ''}>
                    {grupos.length === 0 ? (
                      <span className="text-xs text-muted">Libre</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {grupos.map((g) => (
                          <Chip key={g._id} tone="blue">
                            {g.nomenclatura}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Td>
                ))
              )}
            </tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
