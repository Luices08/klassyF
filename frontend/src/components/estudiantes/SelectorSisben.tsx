import { Select } from '../ui/Field';
import { gruposDeSisben, LETRAS_SISBEN } from '../../lib/sisben';

interface SelectorSisbenProps {
  value: string;
  onChange: (valor: string) => void;
  label?: string;
}

/** Grupo del SISBEN IV del estudiante (vacío = no está en el SISBEN). */
export function SelectorSisben({ value, onChange, label = 'Grupo del SISBEN IV' }: SelectorSisbenProps) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} hint="Lo trae SIMAT. Déjalo vacío si la familia no está en el SISBEN.">
      <option value="">Sin SISBEN</option>
      {LETRAS_SISBEN.map((letra) => (
        <optgroup key={letra} label={`Grupo ${letra}`}>
          {gruposDeSisben(letra).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
