import type { ReactNode } from 'react';
import { type Noticia, type TamanoMosaico, useImagenNoticia } from '../../hooks/useNoticias';
import { fechaDeTarjeta } from '../../lib/noticias';
import { CLASES_CELDA, type NoticiaEnMosaico } from '../../lib/mosaicoNoticias';
import { TarjetaMosaico } from './TarjetaMosaico';

interface CuadriculaMosaicoProps {
  children: ReactNode;
  /** Siempre dos columnas (la vista previa del formulario, que es angosta); si no, cuatro en pantallas anchas. */
  compacta?: boolean;
}

/**
 * La cuadrícula del mosaico. Las filas tienen una altura fija y el flujo es «denso»: una tarjeta pequeña que viene después ocupa el hueco que dejó una grande, así las
 * tarjetas de tamaños distintos quedan encajadas unas con otras y no una debajo de otra.
 */
export function CuadriculaMosaico({ children, compacta = false }: CuadriculaMosaicoProps) {
  return (
    <div className={`grid grid-flow-dense grid-cols-2 gap-3 ${compacta ? 'auto-rows-[9.5rem]' : 'auto-rows-[10rem] md:grid-cols-4 md:auto-rows-[11rem]'}`}>{children}</div>
  );
}

/** Una celda de la cuadrícula con el espacio que le toca a su tamaño. */
export function CeldaMosaico({ tamano, children }: { tamano: TamanoMosaico; children: ReactNode }) {
  return <div className={`min-h-0 min-w-0 ${CLASES_CELDA[tamano]}`}>{children}</div>;
}

/** Una noticia real en el mosaico: pide su portada con la sesión (no hay dirección pública) y abre su detalle al tocarla. */
export function TarjetaMosaicoDeNoticia({ noticia, tamano, onAbrir }: { noticia: Noticia; tamano: TamanoMosaico; onAbrir?: (id: string) => void }) {
  const { data: portada } = useImagenNoticia(noticia.id, noticia.imagen_version);
  return (
    <TarjetaMosaico
      tamano={tamano}
      portadaUrl={noticia.imagen_version === null ? null : (portada ?? null)}
      enfoque={{ x: noticia.enfoque_x, y: noticia.enfoque_y }}
      onAbrir={onAbrir ? () => onAbrir(noticia.id) : undefined}
      datos={{
        titulo: noticia.titulo,
        subtitulo: noticia.subtitulo,
        categoria: { nombre: noticia.categoria.nombre, tono: noticia.categoria.tono },
        autor: noticia.autor,
        cuando: fechaDeTarjeta(noticia),
        fijada: noticia.fijada,
      }}
    />
  );
}

/** Las noticias ya elegidas (ver `paraMosaico`) acomodadas en el mosaico. */
export function MosaicoDeNoticias({ elegidas, onAbrir }: { elegidas: NoticiaEnMosaico[]; onAbrir: (id: string) => void }) {
  return (
    <CuadriculaMosaico>
      {elegidas.map(({ noticia, tamano }) => (
        <CeldaMosaico key={noticia.id} tamano={tamano}>
          <TarjetaMosaicoDeNoticia noticia={noticia} tamano={tamano} onAbrir={onAbrir} />
        </CeldaMosaico>
      ))}
    </CuadriculaMosaico>
  );
}
