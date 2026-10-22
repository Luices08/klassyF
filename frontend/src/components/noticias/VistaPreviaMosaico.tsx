import { type CategoriaNoticia, type Noticia, useNoticiasParaMi } from '../../hooks/useNoticias';
import { type FormularioNoticia, fechaDeTarjetaDeFormulario } from '../../lib/noticias';
import { INFO_TAMANO, paraMosaico } from '../../lib/mosaicoNoticias';
import { CeldaMosaico, CuadriculaMosaico, TarjetaMosaicoDeNoticia } from './MosaicoDeNoticias';
import { TarjetaMosaico } from './TarjetaMosaico';

interface VistaPreviaMosaicoProps {
  form: FormularioNoticia;
  categorias: CategoriaNoticia[];
  /** La portada que se está viendo en el formulario (la nueva o la que ya tenía), ya resuelta. */
  portadaUrl: string | null;
  autor: string;
}

/** Cuántas celdas de la cuadrícula se muestran en la vista previa: lo justo para ver cómo convive la noticia con las demás. */
const PRESUPUESTO_CELDAS = 10;

/**
 * «Mosaico de Noticias»: cómo se verá la noticia que se está escribiendo junto a las vigentes, en tiempo real. La noticia nueva va primero (con el tamaño y el punto de
 * enfoque que se eligen), seguida de las que ya existen, para ver si el tamaño que se le dio le hace sombra a otra o se pierde.
 */
export function VistaPreviaMosaico({ form, categorias, portadaUrl, autor }: VistaPreviaMosaicoProps) {
  const { data: vigentes } = useNoticiasParaMi(12);
  const categoria = categorias.find((c) => c.id === form.categoria_id);
  const otras = (vigentes ?? []).filter((n) => n.id !== form.id);

  // La que se escribe entra primero para conservar su tamaño; de las demás, solo la primera Principal sigue grande (la misma regla del inicio).
  const borrador: Noticia = {
    id: form.id ?? 'borrador',
    titulo: form.titulo,
    subtitulo: form.subtitulo,
    descripcion: '',
    categoria: { id: form.categoria_id, nombre: categoria?.nombre ?? 'Categoría', tono: categoria?.tono ?? 'neutral' },
    fecha_inicio: form.fecha_inicio ? `${form.fecha_inicio}T00:00:00.000Z` : null,
    fecha_fin: form.fecha_fin ? `${form.fecha_fin}T00:00:00.000Z` : null,
    hora: form.hora,
    lugar: form.lugar,
    afecta_clases: form.afecta_clases,
    fijada: form.fijada,
    publicar_desde: new Date().toISOString(),
    alcance: form.alcance,
    imagen_version: form.imagen_version,
    tamano_mosaico: form.tamano_mosaico,
    enfoque_x: form.enfoque_x,
    enfoque_y: form.enfoque_y,
    autor,
  };
  const [propia, ...restantes] = paraMosaico([borrador, ...otras], PRESUPUESTO_CELDAS);

  return (
    <section aria-label="Vista previa del mosaico" className="space-y-3">
      <div>
        <h3 className="text-h3 text-ink">Mosaico de Noticias</h3>
        <p className="text-xs text-muted">Así se verá junto a las demás en el inicio. Tamaño: {INFO_TAMANO[form.tamano_mosaico].etiqueta}.</p>
      </div>
      <CuadriculaMosaico compacta>
        {propia && (
          <CeldaMosaico tamano={propia.tamano}>
            <TarjetaMosaico
              tamano={propia.tamano}
              portadaUrl={portadaUrl}
              enfoque={{ x: form.enfoque_x, y: form.enfoque_y }}
              datos={{
                titulo: form.titulo.trim() || 'Título de la noticia',
                subtitulo: form.subtitulo.trim(),
                categoria: { nombre: categoria?.nombre ?? 'Categoría', tono: categoria?.tono ?? 'neutral' },
                autor,
                cuando: fechaDeTarjetaDeFormulario(form),
                fijada: form.fijada,
              }}
            />
          </CeldaMosaico>
        )}
        {restantes.map(({ noticia, tamano }) => (
          <CeldaMosaico key={noticia.id} tamano={tamano}>
            <TarjetaMosaicoDeNoticia noticia={noticia} tamano={tamano} />
          </CeldaMosaico>
        ))}
      </CuadriculaMosaico>
      {otras.length === 0 && <p className="text-xs text-muted">Aún no hay otras noticias vigentes: la tuya será la primera del mosaico.</p>}
    </section>
  );
}
