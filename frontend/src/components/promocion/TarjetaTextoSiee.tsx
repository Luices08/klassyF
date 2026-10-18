import { Card, CardHeader } from '../ui/Card';
import { Textarea } from '../ui/Field';
import type { PoliticaPromocion } from '../../hooks/usePromocion';

interface Props {
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  bloqueado: boolean;
}

/** El texto oficial del SIEE, para consulta de la comunidad. */
export function TarjetaTextoSiee({ valor: b, onChange: setB, bloqueado }: Props) {
  return (
    <Card>
      <CardHeader title="Texto del SIEE" subtitle="Lo que dice el sistema institucional de evaluación sobre la promoción, para consulta de la comunidad." />
      <Textarea label="Texto" rows={5} maxLength={4000} value={b.texto_siee} disabled={bloqueado} onChange={(e) => setB({ ...b, texto_siee: e.target.value })} />
    </Card>
  );
}
