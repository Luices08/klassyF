import { useState, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import { ChevronDownIcon } from '../ui/icons';

/** Una tarjeta que se pliega para no ocupar la pantalla; la usan los dashboards para conservar la cuadrícula de accesos del menú sin que estorbe. */
export function SeccionPlegable({ titulo, subtitulo, abiertaPorDefecto = false, children }: { titulo: string; subtitulo?: string; abiertaPorDefecto?: boolean; children: ReactNode }) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  return (
    <Card className="space-y-4">
      <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex w-full items-start justify-between gap-3 text-left">
        <span>
          <span className="block text-h3 text-ink">{titulo}</span>
          {subtitulo && <span className="mt-0.5 block text-sm text-muted">{subtitulo}</span>}
        </span>
        <ChevronDownIcon className={`mt-1 h-5 w-5 shrink-0 text-muted transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && children}
    </Card>
  );
}
