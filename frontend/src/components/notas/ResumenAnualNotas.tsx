import type { AsignaturaDelAnio, MisNotasDelAnio, ResumenRecuperacion } from '../../hooks/useNotas';
import { Chip } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { colorDeNota, formatoNota } from './TarjetaNotasAsignatura';

function NotaDePeriodo({ periodo, aprobatoria }: { periodo: AsignaturaDelAnio['periodos'][number]; aprobatoria: number }) {
  if (periodo.nota === null) return <span className="text-muted">—</span>;
  const r = periodo.recuperacion;
  return (
    <div>
      <span className={`font-semibold ${colorDeNota(periodo.nota, aprobatoria)}`}>{formatoNota(periodo.nota)}</span>
      {r?.cuenta && <span className="block text-xs text-muted">recuperada · antes {formatoNota(r.nota_original)}</span>}
    </div>
  );
}

function RecuperacionDeFinDeAnio({ recuperacion, aprobatoria }: { recuperacion: ResumenRecuperacion | null; aprobatoria: number }) {
  if (!recuperacion) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-1">
      <p className="text-xs text-body">
        {formatoNota(recuperacion.nota_original)} → <span className={`font-semibold ${colorDeNota(recuperacion.nota_resultante, aprobatoria)}`}>{formatoNota(recuperacion.nota_resultante)}</span>
      </p>
      <Chip tone={recuperacion.estado === 'SUPERADA' ? 'green' : 'orange'}>{recuperacion.estado === 'SUPERADA' ? 'Superada' : 'No superada'}</Chip>
    </div>
  );
}

/**
 * Cómo va el año por asignatura: la nota de cada periodo (con la recuperación del periodo si la hubo), la definitiva ponderada, la recuperación
 * de fin de año y la nota con la que queda. Lo usan el estudiante en «Mis notas» y el acudiente en el portal.
 */
export function ResumenAnualNotas({ datos, paraFamilia = false }: { datos: MisNotasDelAnio; paraFamilia?: boolean }) {
  const { periodos, asignaturas, nota_aprobatoria: aprobatoria } = datos;
  const hayRecuperacionAnual = asignaturas.some((a) => a.recuperacion_anual !== null);
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">
        La nota de cada periodo ya incluye la recuperación del periodo cuando la hubo. La definitiva del año aparece cuando {paraFamilia ? 'todos los periodos' : 'todos tus periodos'} tienen nota cerrada.
        {hayRecuperacionAnual ? ' La recuperación de fin de año, si se presentó, define la nota final.' : ''}
      </p>
      <Table>
        <TableHead>
          <Th>Asignatura</Th>
          {periodos.map((p) => (
            <Th key={p.numero}>
              {p.nombre} <span className="font-normal normal-case text-muted">({p.porcentaje}%)</span>
            </Th>
          ))}
          <Th>Definitiva</Th>
          <Th>Recuperación de fin de año</Th>
          <Th>Nota final</Th>
        </TableHead>
        <TableBody>
          {asignaturas.map((a) => (
            <tr key={a.teacher_assignment_id}>
              <Td className="font-medium text-ink">{a.asignacion?.asignatura?.nombre ?? 'Asignatura'}</Td>
              {periodos.map((p) => {
                const periodo = a.periodos.find((x) => x.numero === p.numero);
                return <Td key={p.numero}>{periodo ? <NotaDePeriodo periodo={periodo} aprobatoria={aprobatoria} /> : <span className="text-muted">—</span>}</Td>;
              })}
              <Td className={`font-semibold ${colorDeNota(a.definitiva, aprobatoria)}`}>{a.definitiva === null ? <span className="font-normal text-muted">—</span> : formatoNota(a.definitiva)}</Td>
              <Td>
                <RecuperacionDeFinDeAnio recuperacion={a.recuperacion_anual} aprobatoria={aprobatoria} />
              </Td>
              <Td className={`text-base font-bold ${colorDeNota(a.nota_final, aprobatoria)}`}>{a.nota_final === null ? <span className="font-normal text-muted">—</span> : formatoNota(a.nota_final)}</Td>
            </tr>
          ))}
          {asignaturas.length === 0 && <EmptyRow colSpan={periodos.length + 4}>Aún no hay notas cerradas en este año lectivo.</EmptyRow>}
        </TableBody>
      </Table>
    </Card>
  );
}
