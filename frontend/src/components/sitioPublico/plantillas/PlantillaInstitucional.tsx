import { Logo, SeccionesVisibles, TextoHero, type PropsPlantilla } from '../seccionesSitio';
import { CabeceraSuperior } from './CabeceraSuperior';

/** Franja de color suave con el escudo grande junto al titular. Sin carrusel. */
export function PlantillaInstitucional(props: PropsPlantilla) {
  const { info, config, acciones, vistaPrevia } = props;
  return (
    <div className={`${vistaPrevia ? '' : 'min-h-screen'} bg-soft text-body`}>
      <CabeceraSuperior info={info} config={config} acciones={acciones} vistaPrevia={vistaPrevia} />
      <section id="inicio" className="border-b border-border bg-primary-soft">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-16 sm:px-6 md:flex-row">
          <div className="shrink-0 rounded-3xl bg-surface p-5 shadow-sm">
            <Logo info={info} className="h-28 w-28 sm:h-36 sm:w-36" />
          </div>
          <TextoHero info={info} acciones={acciones} centrado={false} />
        </div>
      </section>
      <SeccionesVisibles info={info} config={config} acciones={acciones} />
    </div>
  );
}
