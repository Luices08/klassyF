import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNoticiasParaMi } from '../../hooks/useNoticias';
import { Drawer } from '../ui/Drawer';
import { Spinner } from '../ui/Spinner';
import { CalendarIcon } from '../ui/icons';
import { TarjetaNoticia } from './TarjetaNoticia';

/**
 * El acceso a las noticias del personal (administración, coordinación, secretaría, convivencia y orientación): un botón en el encabezado que abre un panel lateral con lo
 * vigente. Ellos tienen mucha información en su inicio; las noticias no compiten con ella, están a un clic.
 */
export function BotonNoticias() {
  const [abierto, setAbierto] = useState(false);
  // Solo se piden al abrir el panel: no pesan en cada pantalla.
  const { data: noticias, isLoading } = useNoticiasParaMi(30, abierto);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Noticias y eventos"
        aria-label="Noticias y eventos"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-body ring-1 ring-inset ring-border hover:bg-soft"
      >
        <CalendarIcon className="h-[18px] w-[18px]" />
      </button>
      <Drawer open={abierto} title="Noticias y eventos" subtitle="Lo vigente en tus sedes" onClose={() => setAbierto(false)}>
        {isLoading && <Spinner />}
        {!isLoading && (noticias?.length ?? 0) === 0 && <p className="text-sm text-muted">No hay noticias vigentes.</p>}
        {noticias?.map((n) => <TarjetaNoticia key={n.id} noticia={n} compacta />)}
        <Link to="/noticias" onClick={() => setAbierto(false)} className="block text-center text-sm font-semibold text-primary hover:underline">
          Abrir la página de noticias
        </Link>
      </Drawer>
    </>
  );
}
