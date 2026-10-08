import type { InsumosHorario } from '../../types/horarios';
import { Alert } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

/**
 * Antes de generar: qué hay que programar y si cabe. Los avisos del diagnóstico (horas que no caben, bloques dobles
 * imposibles...) se muestran aquí para corregir la causa en vez de generar un horario que no puede salir bien.
 */
export function PanelInsumos({ insumos }: { insumos: InsumosHorario }) {
  const sinFranjas = insumos.estructura.periodos.length === 0 || insumos.estructura.dias.length === 0;

  return (
    <div className="space-y-4">
      {sinFranjas && (
        <Alert tone="warning">
          Esta jornada aún no tiene franjas de clase o días hábiles. Configúralos en Sedes y jornadas: el horario usa esa misma
          estructura de tiempo.
        </Alert>
      )}
      {!sinFranjas && insumos.total_sesiones === 0 && (
        <Alert tone="info">
          No hay carga para programar en esta jornada. Asigna docentes a las asignaturas de sus grupos en Carga académica.
        </Alert>
      )}
      {insumos.avisos.length > 0 ? (
        <Alert tone="warning">
          <p className="font-semibold">Revisa esto antes de generar:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {insumos.avisos.map((a, i) => (
              <li key={i}>{a.mensaje}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        insumos.total_sesiones > 0 && <Alert tone="success">La carga cabe en la semana. Puedes generar el horario.</Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Chip tone="blue">{insumos.total_sesiones} sesiones por ubicar</Chip>
        <Chip tone="neutral">
          {insumos.estructura.dias.length} días × {insumos.estructura.periodos.length} periodos = {insumos.periodos_semana} por semana
        </Chip>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Grupos" subtitle="Horas de clase a programar frente a los periodos de la semana." />
          <Table>
            <TableHead>
              <Th>Grupo</Th>
              <Th>Horas</Th>
              <Th>Ocupación</Th>
            </TableHead>
            <TableBody>
              {insumos.grupos.length === 0 && <EmptyRow colSpan={3}>No hay grupos activos en esta jornada.</EmptyRow>}
              {insumos.grupos.map((g) => (
                <tr key={g._id}>
                  <Td className="font-medium text-ink">{g.etiqueta}</Td>
                  <Td>
                    {g.horas} / {insumos.periodos_semana}
                  </Td>
                  <Td className="w-40">
                    <ProgressBar value={g.horas} max={insumos.periodos_semana} tone={g.horas > insumos.periodos_semana ? 'red' : 'blue'} />
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Docentes" subtitle="Horas de clase y reuniones en esta jornada." />
          <Table>
            <TableHead>
              <Th>Docente</Th>
              <Th>Horas</Th>
            </TableHead>
            <TableBody>
              {insumos.docentes.length === 0 && <EmptyRow colSpan={2}>Sin docentes con carga en esta jornada.</EmptyRow>}
              {insumos.docentes.map((d) => (
                <tr key={d._id}>
                  <Td className="font-medium text-ink">{d.nombre}</Td>
                  <Td>{d.horas}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
