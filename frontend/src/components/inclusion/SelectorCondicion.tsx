import { NOMBRES_TIPO_EXPEDIENTE, type CondicionApoyo, type TipoExpediente, useCondiciones } from '../../hooks/useInclusion';
import { Select } from '../ui/Field';

interface Props {
  label: string;
  value: string;
  onChange: (codigo: string, condicion: CondicionApoyo | null) => void;
  /** Solo las condiciones de este tipo de expediente; sin tipo se muestran las dos, agrupadas. */
  tipo?: TipoExpediente;
  /** Etiqueta de la opción vacía (si se puede dejar sin elegir). */
  vacioLabel?: string;
  disabled?: boolean;
  hint?: string;
}

/**
 * Elige una condición del catálogo del colegio. Una desactivada ya no se ofrece, salvo la que el expediente ya tiene (`value`), para
 * que se vea qué tiene guardado. Las opciones salen de `GET /inclusion/condiciones`: no hay ninguna lista quemada en la pantalla.
 */
export function SelectorCondicion({ label, value, onChange, tipo, vacioLabel, disabled, hint }: Props) {
  const consulta = useCondiciones({ tipo, incluirInactivas: true });
  const todas = consulta.data ?? [];
  const ofrecidas = todas.filter((c) => c.estado === 'activo' || c.codigo === value);
  const tipos: TipoExpediente[] = tipo ? [tipo] : ['PIAR', 'PLAN_APOYO'];

  const opcion = (c: CondicionApoyo) => (
    <option key={c.codigo} value={c.codigo}>
      {c.nombre}
      {c.estado === 'inactivo' ? ' (desactivada)' : ''}
    </option>
  );

  return (
    <Select label={label} value={value} disabled={disabled || consulta.isLoading} hint={consulta.isError ? 'No se pudo cargar el catálogo de condiciones.' : hint} onChange={(e) => onChange(e.target.value, todas.find((c) => c.codigo === e.target.value) ?? null)}>
      {vacioLabel !== undefined && <option value="">{vacioLabel}</option>}
      {tipo
        ? ofrecidas.filter((c) => c.tipo_expediente === tipo).map(opcion)
        : tipos.map((t) => (
            <optgroup key={t} label={NOMBRES_TIPO_EXPEDIENTE[t]}>
              {ofrecidas.filter((c) => c.tipo_expediente === t).map(opcion)}
            </optgroup>
          ))}
    </Select>
  );
}
