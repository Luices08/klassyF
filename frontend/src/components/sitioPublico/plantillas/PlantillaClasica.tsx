import { SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Barra superior, titular centrado y secciones en columna. Sin carrusel. */
export function PlantillaClasica(props: PropsPlantilla) {
  const { info, config, acciones, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-soft text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <TextoHero info={info} acciones={acciones} />
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
