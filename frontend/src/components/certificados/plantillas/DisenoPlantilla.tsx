import { Button } from '../../ui/Button';
import { Card, CardHeader } from '../../ui/Card';
import { Input, Select } from '../../ui/Field';
import { DISENO_INICIAL, ETIQUETA_FUENTE_DISENO, ETIQUETA_TAMANO_DISENO, type DisenoPlantilla, type FuenteDiseno, type TamanoDiseno } from '../../../hooks/useCertificados';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Selector de color: el de colores del navegador y, al lado, el código para escribirlo exacto. */
function CampoColor({ label, hint, valor, onChange }: { label: string; hint: string; valor: string; onChange: (valor: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-label text-body">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: elegir color`}
          value={COLOR_HEX.test(valor) ? valor : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <div className="w-32">
          <Input label={`${label} (código)`} hideLabel value={valor} onChange={(e) => onChange(e.target.value.toUpperCase())} maxLength={7} placeholder="#3F4D61" error={valor && !COLOR_HEX.test(valor) ? 'Usa el formato #RRGGBB.' : undefined} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Cómo se ve el texto del documento: letra, tamaño y colores. Se ve al lado en «Así se ve»; lo demás (encabezado, firmas, QR) lo pone el sistema. */
export function DisenoPlantillaCard({ diseno, onCambiar }: { diseno: DisenoPlantilla | null | undefined; onCambiar: (diseno: DisenoPlantilla | null) => void }) {
  const actual = diseno ?? DISENO_INICIAL;
  const cambiar = (cambio: Partial<DisenoPlantilla>) => onCambiar({ ...actual, ...cambio });
  // El diseño de siempre no se guarda como diseño propio: así «volver al original» y «nunca lo toqué» son lo mismo.
  const esOriginal = !diseno || JSON.stringify(diseno) === JSON.stringify(DISENO_INICIAL);

  return (
    <Card className="space-y-4">
      <CardHeader title="Diseño del texto" subtitle="Cambia la letra, el tamaño y los colores del cuerpo del documento. Se ve al lado, al instante." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tipo de letra" value={actual.fuente} onChange={(e) => cambiar({ fuente: e.target.value as FuenteDiseno })}>
          {(Object.keys(ETIQUETA_FUENTE_DISENO) as FuenteDiseno[]).map((f) => (
            <option key={f} value={f}>
              {ETIQUETA_FUENTE_DISENO[f]}
            </option>
          ))}
        </Select>
        <Select label="Tamaño del texto" value={actual.tamano} onChange={(e) => cambiar({ tamano: e.target.value as TamanoDiseno })}>
          {(Object.keys(ETIQUETA_TAMANO_DISENO) as TamanoDiseno[]).map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TAMANO_DISENO[t]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoColor label="Color del texto" hint="Los párrafos del documento." valor={actual.color_texto} onChange={(color_texto) => cambiar({ color_texto })} />
        <CampoColor label="Color de las frases destacadas" hint="La frase de apertura (CERTIFICA / HACE CONSTAR) y los párrafos destacados." valor={actual.color_destacados} onChange={(color_destacados) => cambiar({ color_destacados })} />
      </div>
      <p className="text-xs text-muted">Los colores deben ser lo bastante oscuros para leerse sobre el papel blanco al imprimir o fotocopiar; si no, el sistema avisa y no deja publicar. El encabezado con el escudo, la tabla de valoraciones, las firmas y el QR no cambian.</p>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" disabled={esOriginal} onClick={() => onCambiar(null)}>
          Volver al diseño original
        </Button>
      </div>
    </Card>
  );
}
