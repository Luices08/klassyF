import { paginasVisibles } from '../../lib/paginacion';
import { Button } from './Button';

interface PaginacionProps {
  pagina: number;
  paginas: number;
  onCambiar: (pagina: number) => void;
  /** Texto opcional junto al número de página, p. ej. «120 usuarios». */
  resumen?: string;
  className?: string;
}

export function Paginacion({ pagina, paginas, onCambiar, resumen, className = '' }: PaginacionProps) {
  if (paginas <= 1) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-muted ${className}`}>
      <span>
        Página {pagina} de {paginas}
        {resumen ? ` · ${resumen}` : ''}
      </span>
      <nav aria-label="Paginación" className="flex flex-wrap items-center gap-1">
        <Button variant="secondary" className="px-3" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          Anterior
        </Button>
        {paginasVisibles(pagina, paginas).map((n) => (
          <Button
            key={n}
            variant={n === pagina ? 'primary' : 'secondary'}
            className="min-w-9 px-3"
            aria-current={n === pagina ? 'page' : undefined}
            onClick={() => n !== pagina && onCambiar(n)}
          >
            {n}
          </Button>
        ))}
        <Button variant="secondary" className="px-3" disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>
          Siguiente
        </Button>
      </nav>
    </div>
  );
}
