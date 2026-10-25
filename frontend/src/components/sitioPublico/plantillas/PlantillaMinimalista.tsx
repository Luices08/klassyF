import { SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Fondo blanco, titular alineado a la izquierda con mucho aire y una línea que lo separa de las secciones. Sin carrusel. */
export function PlantillaMinimalista(props: PropsPlantilla) {
  const { info, config, acciones, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-surface text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="max-w-3xl border-l-4 border-primary pl-6">
          <TextoHero info={info} acciones={acciones} centrado={false} />
        </div>
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
