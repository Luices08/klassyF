import type { Espacio, GrupoAsignadoEspacio } from '../../types/domain';
import { Chip } from '../ui/Badge';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;
const HORA_INICIO_POR_DEFECTO = 6;
const HORA_FIN_POR_DEFECTO = 18;

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const etiquetaHora = (hora: number): string => `${String(hora).padStart(2, '0')}:00`;

/** La jornada sabatina se dicta solo el sábado; las demás de lunes a viernes. */
function ocupaDia(grupo: GrupoAsignadoEspacio, dia: string): boolean {
  if (!grupo.jornada) return false;
  return grupo.jornada.nombre === 'SABATINA' ? dia === 'Sábado' : dia !== 'Sábado';
}

function ocupaHora(grupo: GrupoAsignadoEspacio, hora: number): boolean {
  if (!grupo.jornada) return false;
  return aMinutos(grupo.jornada.hora_inicio) < (hora + 1) * 60 && aMinutos(grupo.jornada.hora_fin) > hora * 60;
}

/**
 * Malla semanal de ocupación de un espacio (M10): qué franjas tiene tomadas por sus grupos titulares. La ocupación
 * por asignatura se sumará cuando exista el motor de horarios (M09); hoy solo hay salón titular por jornada.
 */
export function MallaOcupacionEspacio({ espacio }: { espacio: Espacio }) {
  const grupos = espacio.grupos_asignados.filter((g) => g.jornada);
  const dias = grupos.some((g) => g.jornada?.nombre === 'SABATINA') ? [...DIAS_SEMANA, 'Sábado'] : [...DIAS_SEMANA];

  const inicios = grupos.map((g) => Math.floor(aMinutos(g.jornada!.hora_inicio) / 60));
  const fines = grupos.map((g) => Math.ceil(aMinutos(g.jornada!.hora_fin) / 60));
  const desde = grupos.length ? Math.min(...inicios) : HORA_INICIO_POR_DEFECTO;
  const hasta = grupos.length ? Math.max(...fines) : HORA_FIN_POR_DEFECTO;
  const horas = Array.from({ length: Math.max(0, hasta - desde) }, (_, i) => desde + i);

  const noOperativo = espacio.estado !== 'DISPONIBLE';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {grupos.length === 0
          ? 'Sin grupos titulares en este año lectivo: el espacio está libre toda la semana.'
          : 'Franjas ocupadas por el salón titular de cada grupo. La ocupación por asignatura llegará con el motor de horarios (M09).'}
      </p>
      {noOperativo && (
        <Chip tone="orange">
          {espacio.estado === 'EN_MANTENIMIENTO' ? 'En mantenimiento' : 'Inactivo'}: no se asigna a nuevos grupos
        </Chip>
      )}
      <Table>
        <TableHead>
          <Th>Hora</Th>
          {dias.map((d) => (
            <Th key={d}>{d}</Th>
          ))}
        </TableHead>
        <TableBody>
          {horas.map((hora) => (
            <tr key={hora}>
              <Td className="whitespace-nowrap font-mono text-xs text-muted">
                {etiquetaHora(hora)} – {etiquetaHora(hora + 1)}
              </Td>
              {dias.map((dia) => {
                const ocupantes = grupos.filter((g) => ocupaDia(g, dia) && ocupaHora(g, hora));
                return (
                  <Td key={dia} className={ocupantes.length ? 'bg-primary-soft/40' : ''}>
                    {ocupantes.length === 0 ? (
                      <span className="text-xs text-muted">Libre</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {ocupantes.map((g) => (
                          <Chip key={g._id} tone="blue">
                            {g.nomenclatura}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Td>
                );
              })}
            </tr>
          ))}
          {horas.length === 0 && <EmptyRow colSpan={dias.length + 1}>Sin franjas por mostrar.</EmptyRow>}
        </TableBody>
      </Table>
    </div>
  );
}
