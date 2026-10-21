import { Link } from 'react-router-dom';
import type { FiltrosDashboard } from '../../hooks/useDashboard';
import { usePanelConvivencia, usePanelOrientacion } from '../../hooks/useDashboard';
import { Chip } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

/**
 * Lo que rectoría ve de convivencia y orientación: solo cuántos casos, remisiones y expedientes esperan atención, cada uno con el enlace a su pantalla. Es la
 * única vista de estos datos fuera de los dos paneles de esos perfiles: el coordinador académico no la tiene (no ve convivencia ni orientación en M14/M15).
 */
export function AlertasDeBienestar({ filtros }: { filtros: FiltrosDashboard | null }) {
  const convivencia = usePanelConvivencia(filtros);
  const orientacion = usePanelOrientacion(filtros);
  const c = convivencia.data;
  const o = orientacion.data;

  const filas = [
    { etiqueta: 'Solicitudes de caso por atender', valor: c?.solicitudes.pendientes, to: '/convivencia/solicitudes' },
    { etiqueta: 'Casos con alerta', valor: c?.alertas.total, to: '/convivencia/casos' },
    { etiqueta: 'Remisiones a orientación por atender', valor: o?.remisiones.PENDIENTE, to: '/orientacion/remisiones' },
    { etiqueta: 'Solicitudes de apoyo por valorar', valor: o?.solicitudes_apoyo.pendientes, to: '/inclusion' },
    { etiqueta: 'Expedientes sin autorización de datos', valor: o?.expedientes.sin_autorizacion, to: '/inclusion' },
  ];

  return (
    <Card>
      <CardHeader title="Convivencia y orientación" subtitle="Casos y expedientes que esperan atención" />
      {convivencia.isLoading || orientacion.isLoading ? (
        <Spinner />
      ) : convivencia.isError && orientacion.isError ? (
        <p className="text-sm text-danger">No se pudo cargar este resumen.</p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f) => (
            <li key={f.etiqueta}>
              <Link to={f.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-body hover:bg-soft">
                <span>{f.etiqueta}</span>
                {f.valor === undefined ? <Chip>—</Chip> : <Chip tone={f.valor > 0 ? 'orange' : 'green'}>{f.valor}</Chip>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
