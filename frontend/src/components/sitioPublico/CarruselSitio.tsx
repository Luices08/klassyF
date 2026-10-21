import { useEffect, useState } from 'react';

const INTERVALO_MS = 5000;

/** Carrusel de las imágenes que sube el colegio. Con una sola no hay controles; con movimiento reducido no avanza solo. */
export function CarruselSitio({ imagenes, className = '' }: { imagenes: string[]; className?: string }) {
  const [actual, setActual] = useState(0);
  const total = imagenes.length;

  useEffect(() => {
    if (actual >= total) setActual(0);
  }, [actual, total]);

  useEffect(() => {
    if (total < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const temporizador = setInterval(() => setActual((i) => (i + 1) % total), INTERVALO_MS);
    return () => clearInterval(temporizador);
  }, [total, actual]);

  if (total === 0) {
    return (
      <div className={`flex items-center justify-center bg-primary-soft text-sm text-muted ${className}`}>
        Aún no hay imágenes en el carrusel
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-soft ${className}`} aria-roledescription="carrusel">
      {imagenes.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={`Imagen ${i + 1} de ${total}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === actual ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={i !== actual}
        />
      ))}
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Imagen anterior"
            onClick={() => setActual((actual - 1 + total) % total)}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink shadow hover:bg-surface"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Imagen siguiente"
            onClick={() => setActual((actual + 1) % total)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-ink shadow hover:bg-surface"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {imagenes.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Ir a la imagen ${i + 1}`}
                aria-current={i === actual}
                onClick={() => setActual(i)}
                className={`h-2 rounded-full transition-all ${i === actual ? 'w-6 bg-surface' : 'w-2 bg-surface/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
