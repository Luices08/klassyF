import { Button } from '../../ui/Button';
import { Card, CardHeader } from '../../ui/Card';
import { Input } from '../../ui/Field';
import type { ContenidoPlantilla } from '../../../hooks/useCertificados';

const claveDe = (etiqueta: string, existentes: string[]): string => {
  const base = etiqueta.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'OPCION';
  let clave = base === 'OTRO' ? 'OTRA_OPCION' : base;
  let n = 2;
  while (existentes.includes(clave)) clave = `${base}_${n++}`;
  return clave;
};

/** Vigencia del documento y opciones del selector «¿Para quién o para qué se expide?» que ve quien expide. */
export function DestinatariosPlantilla({ borrador, onCambiar }: { borrador: ContenidoPlantilla; onCambiar: (cambio: (b: ContenidoPlantilla) => ContenidoPlantilla) => void }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader title="Vigencia" subtitle="Cuánto tiempo vale el documento al verificar su código QR." />
        <div className="max-w-xs">
          <Input
            label="Vigencia (días)"
            type="number"
            min={1}
            max={365}
            value={borrador.vigencia_dias ?? ''}
            onChange={(e) => onCambiar((b) => ({ ...b, vigencia_dias: e.target.value === '' ? null : Number(e.target.value) }))}
            hint="Vacío = sin vigencia. Pasado ese plazo, la verificación dice «vigencia cumplida»."
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <CardHeader title="Para quién o para qué se expide" subtitle="Las opciones que ve quien expide el documento; la primera es la predeterminada. «Otro (especificar…)» siempre se agrega al final." />
        {borrador.destinatarios.map((d, i) => (
          <div key={d.clave} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Input label="Nombre en el selector" value={d.etiqueta} maxLength={80} onChange={(e) => onCambiar((b) => ({ ...b, destinatarios: b.destinatarios.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)) }))} />
            <Input label="Frase que lleva el documento" value={d.frase} maxLength={200} onChange={(e) => onCambiar((b) => ({ ...b, destinatarios: b.destinatarios.map((x, j) => (j === i ? { ...x, frase: e.target.value } : x)) }))} />
            <Button type="button" variant="soft-danger" className="px-3 py-2 text-xs" disabled={borrador.destinatarios.length <= 1} onClick={() => onCambiar((b) => ({ ...b, destinatarios: b.destinatarios.filter((_, j) => j !== i) }))}>
              Quitar
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={borrador.destinatarios.length >= 12}
          onClick={() =>
            onCambiar((b) => ({ ...b, destinatarios: [...b.destinatarios, { clave: claveDe(`Nueva opción ${b.destinatarios.length + 1}`, b.destinatarios.map((x) => x.clave)), etiqueta: `Nueva opción ${b.destinatarios.length + 1}`, frase: 'Se expide para ' }] }))
          }
        >
          Agregar opción
        </Button>
        <Input label="Frase cuando eligen «Otro»" value={borrador.frase_otro} maxLength={200} onChange={(e) => onCambiar((b) => ({ ...b, frase_otro: e.target.value }))} hint="{texto} es lo que escriba quien expide. Si lo deja vacío se usa la primera opción." />
      </Card>
    </div>
  );
}
