import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNoticiasParaMi } from '../../hooks/useNoticias';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { MosaicoDeNoticias } from './MosaicoDeNoticias';
import { NoticiaDetalleDrawer } from './NoticiaDetalleDrawer';

/** Cuántas celdas de la cuadrícula ocupa el mosaico del inicio: una Principal más unas cuantas más pequeñas. En la página de noticias se ven todas. */
const CELDAS_EN_EL_INICIO = 10;

/**
 * Las noticias y eventos en el inicio de cada perfil (docentes, estudiantes, acudientes, secretaría, convivencia y orientación) como un mosaico: las tarjetas tienen
 * tamaños distintos según la importancia que les dio quien las publicó, así el inicio se lee como un periódico. Con una o dos noticias se dibujan como bandas a todo el ancho. Solo trae lo que le toca a quien mira (por su perfil, sus
 * grupos y sus sedes). No ocupa espacio si no hay noticias.
 */
export function MosaicoNoticiasInicio() {
  const { data: noticias, isLoading } = useNoticiasParaMi(30);
  const [abierta, setAbierta] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if ((noticias ?? []).length === 0) return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-ink">Noticias y eventos</h2>
        <Link to="/noticias" className="text-sm font-semibold text-primary hover:underline">
          Ver todas
        </Link>
      </div>
      <MosaicoDeNoticias noticias={noticias ?? []} presupuesto={CELDAS_EN_EL_INICIO} onAbrir={setAbierta} />
      <NoticiaDetalleDrawer id={abierta} onClose={() => setAbierta(null)} />
    </Card>
  );
}
