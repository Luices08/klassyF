import type { ReactNode } from 'react';

/**
 * Una fila de tarjetas que se reparte el ancho sin dejar huecos: una sola tarjeta ocupa toda la fila, dos se la reparten, y las que no caben en una línea bajan.
 * Las tarjetas hijas toman la altura de la fila (`h-full` en `Card`), así quedan parejas.
 */
export function FilaAdaptable({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-stretch gap-4">{children}</div>;
}

/**
 * La fila principal de un panel: lo analítico a la izquierda (dos tercios) y los accesos a la derecha (un tercio). Ambas columnas se estiran a la misma altura y
 * sus tarjetas se llenan (`[&>*]:flex-1`), de modo que ninguna deja un espacio en blanco debajo.
 */
export function FilaPrincipal({ izquierda, derecha }: { izquierda: ReactNode; derecha: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2 [&>*]:flex-1">{izquierda}</div>
      <div className="flex flex-col gap-4 [&>*]:flex-1">{derecha}</div>
    </div>
  );
}
