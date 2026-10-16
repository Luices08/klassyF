interface ContenidoRicoProps {
  /** HTML que ya limpió el servidor (`sanitizarContenido`): nunca se pasa aquí texto sin pasar por él. */
  html: string;
  className?: string;
}

/** Dibuja el texto enriquecido de una actividad con el mismo estilo del editor. */
export function ContenidoRico({ html, className = '' }: ContenidoRicoProps) {
  return <div className={`contenido-rico ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
