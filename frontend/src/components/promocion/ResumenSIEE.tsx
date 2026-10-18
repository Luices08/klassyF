import { Card, CardHeader } from '../ui/Card';
import type { PoliticaPromocion } from '../../hooks/usePromocion';
import { type NombresCatalogo, resumenPolitica } from '../../lib/resumenPolitica';

/** «Así queda tu SIEE»: la política actual del formulario, dicha en frases. Sirve al directivo para revisar y al coordinador para consultar. */
export function ResumenSIEE({ politica, notaAprobatoria, nombres }: { politica: PoliticaPromocion; notaAprobatoria: number; nombres: NombresCatalogo }) {
  const frases = resumenPolitica(politica, notaAprobatoria, nombres);
  return (
    <Card>
      <CardHeader title="Así queda tu SIEE" subtitle="Se actualiza mientras editas." />
      <ul className="space-y-2 text-sm text-body">
        {frases.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
