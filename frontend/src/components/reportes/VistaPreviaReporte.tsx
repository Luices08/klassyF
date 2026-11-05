import { type ConsultaReporte, cargarReporte } from '../../hooks/useReportes';
import { VistaPreviaPdf } from '../ui/VistaPreviaPdf';

/** Lo que se pidió ver: la ruta del PDF y los filtros tal como estaban al pulsar «Vista previa». */
export interface SolicitudDeVista {
  ruta: string;
  consulta: ConsultaReporte;
  nombreArchivo: string;
  titulo: string;
}

/**
 * La vista previa de un reporte en PDF, antes de descargarlo. Muestra el mismo archivo que se baja (mismo cálculo), así que sirve para revisar cómo
 * quedará el documento. Cambiar los filtros no la recalcula sola: se vuelve a pedir al pulsar «Vista previa» (o «Actualizar»), porque genera el
 * documento completo y con muchos grupos puede tardar.
 */
export function VistaPreviaReporte({ vista, onCerrar }: { vista: SolicitudDeVista; onCerrar: () => void }) {
  return (
    <VistaPreviaPdf
      claveConsulta={['reporte-cierre', vista.ruta, vista.consulta]}
      cargar={() => cargarReporte(vista.ruta, vista.consulta)}
      nombreArchivo={vista.nombreArchivo}
      titulo={vista.titulo}
      onCerrar={onCerrar}
      nota={<p className="mb-3 text-xs text-muted">Es el mismo documento que se descarga, calculado con lo que hay registrado en este momento.</p>}
    />
  );
}
