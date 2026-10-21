import { Link } from 'react-router-dom';
import { useNoticiasParaMi } from '../../hooks/useNoticias';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { TarjetaNoticia } from './TarjetaNoticia';

const MAXIMO = 3;

/**
 * Las próximas noticias y eventos en el inicio de docentes, estudiantes y acudientes: lo que les toca (por su perfil, sus grupos y sus sedes), con lo fijado y los
 * eventos más cercanos primero. No muestra nada si no hay noticias: no ocupa espacio con un vacío.
 */
export function PanelNoticiasInicio() {
  const { data: noticias, isLoading } = useNoticiasParaMi(MAXIMO + 1);
  if (isLoading) return <Spinner />;
  if (!noticias || noticias.length === 0) return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-ink">Noticias y eventos</h2>
        <Link to="/noticias" className="text-sm font-semibold text-primary hover:underline">
          Ver todas
        </Link>
      </div>
      <div className="space-y-3">
        {noticias.slice(0, MAXIMO).map((n) => (
          <TarjetaNoticia key={n.id} noticia={n} compacta />
        ))}
      </div>
    </Card>
  );
}
