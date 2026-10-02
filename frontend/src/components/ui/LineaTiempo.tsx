import type { ReactNode } from 'react';

export interface LineaTiempoItem {
  key: string;
  /** Texto ya formateado (ver lib/fechas.ts): la línea de tiempo no formatea fechas. */
  fecha: string;
  /** Chips o etiquetas junto a la fecha. */
  encabezado?: ReactNode;
  /** Apagado visualmente (p. ej. un registro anulado). */
  atenuado?: boolean;
  children: ReactNode;
}

/** Línea de tiempo vertical (más reciente arriba): un punto azul por registro, sin colores nuevos. */
export function LineaTiempo({ items, vacio }: { items: LineaTiempoItem[]; vacio?: ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-muted">{vacio ?? 'Sin registros.'}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((item) => (
        <li key={item.key} className={item.atenuado ? 'opacity-60' : ''}>
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-surface" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-ink">{item.fecha}</span>
            {item.encabezado}
          </div>
          <div className="mt-1.5 rounded-xl border border-border bg-surface p-3 text-sm text-body">{item.children}</div>
        </li>
      ))}
    </ol>
  );
}
