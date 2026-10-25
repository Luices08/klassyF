import { type ReactNode, useEffect } from 'react';
import type { ConfiguracionSitio } from '../../types/sitioPublico';

const ID_ENLACE_FUENTE = 'sitio-fuente-';

/** Pide a Google Fonts solo las fuentes elegidas; `index.html` ya precarga Plus Jakarta Sans. */
function useFuentes(fuentes: string[]) {
  useEffect(() => {
    for (const fuente of fuentes) {
      const id = ID_ENLACE_FUENTE + fuente.replace(/\s+/g, '-');
      if (document.getElementById(id)) continue;
      const enlace = document.createElement('link');
      enlace.id = id;
      enlace.rel = 'stylesheet';
      enlace.href = `https://fonts.googleapis.com/css2?family=${fuente.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(enlace);
    }
  }, [fuentes.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}

// El color y la letra del título y del texto son independientes de la plantilla: se aplican con variables al contenedor del
// sitio, y las reglas están acotadas a `.sitio-personalizado` para no tocar ninguna pantalla con sesión.
const ESTILOS = `
.sitio-personalizado { font-family: var(--sp-fuente-texto), 'Plus Jakarta Sans', sans-serif; color: var(--sp-color-texto); }
.sitio-personalizado button, .sitio-personalizado input, .sitio-personalizado select { font-family: inherit; }
.sitio-personalizado :is(h1, h2, h3, h4, .text-ink) { font-family: var(--sp-fuente-titulo), 'Plus Jakarta Sans', sans-serif; color: var(--sp-color-titulo); }
.sitio-personalizado :is(p, li, address, .text-body):not(.text-ink) { color: var(--sp-color-texto); }
.sitio-personalizado .text-muted:not(.text-ink) { color: color-mix(in srgb, var(--sp-color-texto) 75%, transparent); }
.sitio-personalizado nav a { color: var(--sp-color-texto); }
`;

interface Props {
  tipografia: ConfiguracionSitio['tipografia'];
  className?: string;
  children: ReactNode;
}

export function EnvolturaSitio({ tipografia, className = '', children }: Props) {
  useFuentes([tipografia.fuente_titulo, tipografia.fuente_texto]);
  const variables = {
    '--sp-fuente-titulo': `'${tipografia.fuente_titulo}'`,
    '--sp-fuente-texto': `'${tipografia.fuente_texto}'`,
    '--sp-color-titulo': tipografia.color_titulo,
    '--sp-color-texto': tipografia.color_texto,
  } as React.CSSProperties;

  return (
    <div className={`sitio-personalizado ${className}`} style={variables}>
      <style>{ESTILOS}</style>
      {children}
    </div>
  );
}
