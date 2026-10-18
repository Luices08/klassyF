import { forwardRef, useState } from 'react';
import { Chip } from '../../ui/Badge';
import { EditorConVariables, type EditorConVariablesHandle } from '../../ui/EditorConVariables';
import { Select } from '../../ui/Field';
import { ChevronDownIcon, SlidersIcon, TrashIcon } from '../../ui/icons';
import { IconButton } from '../../ui/IconButton';
import { Switch } from '../../ui/Switch';
import { ETIQUETA_ESTILO_BLOQUE, type BloquePlantilla, type VariableCertificado } from '../../../hooks/useCertificados';

interface ParrafoPlantillaProps {
  bloque: BloquePlantilla;
  numero: number;
  esObligatorio: boolean;
  puedeSubir: boolean;
  puedeBajar: boolean;
  variables: VariableCertificado[];
  onCambiar: (cambio: Partial<BloquePlantilla>) => void;
  onMover: (delta: -1 | 1) => void;
  onQuitar: () => void;
  onEnfocar: () => void;
}

/** Un párrafo del documento: el texto a la vista y lo secundario (cuándo se muestra, ocultarlo) detrás de «Opciones». */
export const ParrafoPlantilla = forwardRef<EditorConVariablesHandle, ParrafoPlantillaProps>(function ParrafoPlantilla(
  { bloque, numero, esObligatorio, puedeSubir, puedeBajar, variables, onCambiar, onMover, onQuitar, onEnfocar },
  ref
) {
  const [opciones, setOpciones] = useState(Boolean(bloque.condicion));
  const nombre = ETIQUETA_ESTILO_BLOQUE[bloque.estilo];
  const puedeQuitar = !esObligatorio && bloque.id.startsWith('extra-');

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${bloque.activo ? 'border-border' : 'border-dashed border-border bg-soft'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          <span className="text-muted">{numero}.</span>
          {nombre}
          {esObligatorio && <Chip tone="blue">Obligatorio</Chip>}
          {bloque.condicion && <Chip tone="orange">Solo en ciertos casos</Chip>}
          {!bloque.activo && <Chip tone="neutral">Oculto</Chip>}
        </p>
        <div className="flex items-center gap-1.5">
          <IconButton label="Subir párrafo" icon={<ChevronDownIcon className="rotate-180" />} disabled={!puedeSubir} onClick={() => onMover(-1)} />
          <IconButton label="Bajar párrafo" icon={<ChevronDownIcon />} disabled={!puedeBajar} onClick={() => onMover(1)} />
          <IconButton label={opciones ? 'Ocultar opciones' : 'Opciones del párrafo'} tone={opciones ? 'edit' : 'neutral'} icon={<SlidersIcon />} onClick={() => setOpciones((v) => !v)} />
          {puedeQuitar && <IconButton label="Quitar párrafo" tone="danger" icon={<TrashIcon />} onClick={onQuitar} />}
        </div>
      </div>

      {bloque.estilo === 'TABLA_NOTAS' ? (
        <p className="text-xs text-muted">Aquí va la tabla de valoraciones. La arma el módulo de notas con la escala de la institución; este bloque solo fija en qué lugar del documento se coloca.</p>
      ) : (
        <EditorConVariables ref={ref} label={`Texto del párrafo ${numero}: ${nombre}`} value={bloque.texto} variables={variables} onChange={(texto) => onCambiar({ texto })} onFocus={onEnfocar} />
      )}

      {opciones && (
        <div className="space-y-3 rounded-lg bg-soft p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Cuándo se muestra"
              value={bloque.condicion ? bloque.condicion.tipo : 'SIEMPRE'}
              onChange={(e) => onCambiar({ condicion: e.target.value === 'SIEMPRE' ? null : { tipo: e.target.value as 'HAY' | 'NO_HAY', variable: bloque.condicion?.variable ?? variables[0]?.clave ?? '' } })}
            >
              <option value="SIEMPRE">Siempre</option>
              <option value="HAY">Solo si existe este dato…</option>
              <option value="NO_HAY">Solo si NO existe este dato…</option>
            </Select>
            {bloque.condicion && (
              <Select label="Dato" value={bloque.condicion.variable} onChange={(e) => onCambiar({ condicion: { tipo: bloque.condicion!.tipo, variable: e.target.value } })}>
                {variables.map((v) => (
                  <option key={v.clave} value={v.clave}>
                    {v.etiqueta}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Switch label="Párrafo visible en el documento" checked={bloque.activo} onChange={(valor) => onCambiar({ activo: valor })} disabled={esObligatorio} disabledReason={esObligatorio ? 'Es obligatorio en este documento.' : null} />
        </div>
      )}
    </div>
  );
});
