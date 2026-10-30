import type { ReactNode } from 'react';
import { type Noticia, type TamanoMosaico, useImagenNoticia } from '../../hooks/useNoticias';
import { fechaDeTarjeta } from '../../lib/noticias';
import { CLASES_CELDA, disponerNoticias } from '../../lib/mosaicoNoticias';
import { TarjetaBanda } from './TarjetaBanda';
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

/** Los datos de una noticia ya escritos para dibujarla en cualquier tarjeta. */
function datosDeNoticia(noticia: Noticia) {
  return {
    titulo: noticia.titulo,
    subtitulo: noticia.subtitulo,
    descripcion: noticia.descripcion,
    categoria: { nombre: noticia.categoria.nombre, tono: noticia.categoria.tono },
    autor: noticia.autor,
    cuando: fechaDeTarjeta(noticia),
    fijada: noticia.fijada,
  };
}

/**
 * Una noticia real: pide su portada con la sesión (no hay dirección pública) y abre su detalle al tocarla. Se dibuja como banda cuando hay pocas noticias (`enBandas`)
 * o si su tamaño es «Banda»; si no, como tarjeta de mosaico.
 */
export function TarjetaMosaicoDeNoticia({ noticia, tamano, onAbrir, enBandas = false }: { noticia: Noticia; tamano: TamanoMosaico; onAbrir?: (id: string) => void; enBandas?: boolean }) {
  const { data: portada } = useImagenNoticia(noticia.id, noticia.imagen_version);
  const comunes = {
    portadaUrl: noticia.imagen_version === null ? null : (portada ?? null),
    enfoque: { x: noticia.enfoque_x, y: noticia.enfoque_y },
    onAbrir: onAbrir ? () => onAbrir(noticia.id) : undefined,
    datos: datosDeNoticia(noticia),
  };
  if (enBandas || tamano === 'BANDA') return <TarjetaBanda {...comunes} alta={tamano === 'PRINCIPAL' || tamano === 'DESTACADA' || tamano === 'BANDA'} llenarAlto={!enBandas} />;
  return <TarjetaMosaico {...comunes} tamano={tamano} />;
}

/** Las bandas de una o dos noticias: una debajo de la otra, cada una a todo el ancho. */
export function ListaDeBandas({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/**
 * Las noticias de un inicio, dispuestas según cuántas hay (ver `disponerNoticias`): una o dos, como bandas a todo el ancho; tres o más, el mosaico con el tamaño de
 * cada una y sin huecos al final.
 */
export function MosaicoDeNoticias({ noticias, presupuesto, onAbrir }: { noticias: Noticia[]; presupuesto?: number; onAbrir: (id: string) => void }) {
  const { disposicion, elegidas } = disponerNoticias(noticias, presupuesto);
  if (disposicion === 'BANDAS') {
    return (
      <ListaDeBandas>
        {elegidas.map(({ noticia, tamano }) => (
          <TarjetaMosaicoDeNoticia key={noticia.id} noticia={noticia} tamano={tamano} onAbrir={onAbrir} enBandas />
        ))}
      </ListaDeBandas>
    );
  }
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
