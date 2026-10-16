import type { DocenteCargaResumen } from '../../types/domain';
import { Chip } from '../ui/Badge';

/** Un docente en varios niveles se mide como % de su jornada: un tope en horas redondeado se contradiría con el diagnóstico. */
export function ChipCarga({ item }: { item: DocenteCargaResumen }) {
  const horas = item.horas_totales;
  if (item.estado_carga === 'SIN_CARGA') {
    return (
      <Chip tone="neutral">{horas === 0 ? 'Sin asignación (0 h)' : `Sin clases (${horas} h en otras asignaciones)`}</Chip>
    );
  }

  const detalle =
    item.nivel_predominante === 'MULTINIVEL' && item.fraccion_carga != null
      ? `${horas}h · ${Math.round(item.fraccion_carga * 100)}% de la jornada`
      : `${horas}h ${item.estado_carga === 'SOBRE_CARGA' ? '>' : '/'} ${item.tope_horas}h`;

  if (item.estado_carga === 'SOBRE_CARGA') return <Chip tone="red">Sobrecarga ({detalle})</Chip>;
  if (item.estado_carga === 'SUB_CARGA') return <Chip tone="orange">Subcarga ({detalle})</Chip>;
  return <Chip tone="green">Normal ({detalle})</Chip>;
}
