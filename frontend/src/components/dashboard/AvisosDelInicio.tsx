import { Link } from 'react-router-dom';
import { useAnuncios } from '../../hooks/useNotificaciones';
import { formatoFechaLocal } from '../../lib/fechas';
import { Card } from '../ui/Card';
import { MegaphoneIcon } from '../ui/icons';
import { EntradaComunicacion } from './PanelComunicacion';

/** Cuántos avisos caben: los más recientes; el resto está en «Ver todos». */
const MAX_AVISOS = 3;

/**
 * Los avisos vigentes del perfil (los comunicados cortos de coordinación y rectoría) en el inicio de docentes, estudiantes y acudientes, con las mismas entradas de la banda
 * de comunicación de rectoría. No ocupa espacio si no hay avisos.
 */
export function AvisosDelInicio() {
  const { data: anuncios = [] } = useAnuncios();
  if (anuncios.length === 0) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 text-ink">Avisos</h2>
        <Link to="/anuncios" className="text-sm font-semibold text-primary hover:underline">
          Ver todos
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {anuncios.slice(0, MAX_AVISOS).map((a) => (
          <EntradaComunicacion
            key={a.id}
            item={{ clave: a.id, titulo: a.titulo, cuando: formatoFechaLocal(a.publicar_desde), etiqueta: a.fijado ? 'Fijado' : 'Aviso', tono: 'blue', to: '/anuncios', icono: MegaphoneIcon }}
          />
        ))}
      </ul>
    </Card>
  );
}
