import { useUsers } from '../../hooks/useUsers';
import { type EntradaMiembro, NOMBRES_REPRESENTACION, type Representacion } from '../../hooks/useComision';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Switch } from '../ui/Switch';

/**
 * Los integrantes de una sesión. Un integrante puede ser un usuario del sistema (firma con su contraseña) o alguien externo, como el
 * personero o un representante de padres sin cuenta (firma en papel). Solo uno puede presidir.
 */
export function MiembrosEditor({ value, onChange, deshabilitado }: { value: EntradaMiembro[]; onChange: (m: EntradaMiembro[]) => void; deshabilitado?: boolean }) {
  const { data: usuarios = [] } = useUsers({ estado: 'activo' }, !deshabilitado);
  const opciones = opcionesDePersonas(usuarios.filter((u) => u.rol !== 'ESTUDIANTE'));
  const cambiar = (i: number, cambios: Partial<EntradaMiembro>) => onChange(value.map((m, k) => (k === i ? { ...m, ...cambios } : m)));

  const cambiarUsuario = (i: number, userId: string | undefined) => {
    if (!userId) {
      cambiar(i, { user_id: undefined });
      return;
    }
    const u = usuarios.find((x) => x._id === userId);
    let cargoAuto = value[i]?.cargo || '';
    let representaAuto: Representacion = value[i]?.representa ?? 'OTRO';

    if (u) {
      if (u.rol === 'DOCENTE') {
        cargoAuto = cargoAuto || 'Docente';
        representaAuto = 'DOCENTE';
      } else if (u.rol === 'COORDINADOR') {
        cargoAuto = cargoAuto || 'Coordinador(a)';
        representaAuto = 'DIRECTIVO';
      } else if (u.rol === 'ADMIN') {
        cargoAuto = cargoAuto || 'Rector(a)';
        representaAuto = 'DIRECTIVO';
      } else if (u.rol === 'ORIENTADOR') {
        cargoAuto = cargoAuto || 'Orientador(a) escolar';
        representaAuto = 'ORIENTACION';
      } else if (u.rol === 'ACUDIENTE') {
        cargoAuto = cargoAuto || 'Representante de Padres';
        representaAuto = 'PADRES';
      }
    }

    cambiar(i, { user_id: userId, cargo: cargoAuto, representa: representaAuto });
  };

  return (
    <div className="space-y-3">
      {value.map((m, i) => {
        const externo = m.user_id === null;
        return (
          <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              {externo ? (
                <Input label="Nombre (sin usuario)" value={m.nombre ?? ''} disabled={deshabilitado} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
              ) : (
                <SelectBuscable label="Usuario" value={m.user_id ?? ''} onChange={(v) => cambiarUsuario(i, v || undefined)} disabled={deshabilitado} vacioLabel="Elige un usuario" placeholder="Buscar usuario…" opciones={opciones} />
              )}
            </div>
            <Input label="Cargo" value={m.cargo} maxLength={120} disabled={deshabilitado} onChange={(e) => cambiar(i, { cargo: e.target.value })} />
            <Select label="Representa a" value={m.representa ?? 'OTRO'} disabled={deshabilitado} onChange={(e) => cambiar(i, { representa: e.target.value as Representacion })}>
              {(Object.keys(NOMBRES_REPRESENTACION) as Representacion[]).map((r) => (
                <option key={r} value={r}>
                  {NOMBRES_REPRESENTACION[r]}
                </option>
              ))}
            </Select>
            <Switch label="Preside" checked={Boolean(m.es_presidente)} disabled={deshabilitado} onChange={(v) => onChange(value.map((x, k) => ({ ...x, es_presidente: k === i ? v : false })))} />
            {!deshabilitado && (
              <Button type="button" variant="soft-danger" onClick={() => onChange(value.filter((_, k) => k !== i))}>
                Quitar
              </Button>
            )}
          </div>
        );
      })}
      {!deshabilitado && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => onChange([...value, { user_id: undefined, cargo: '', representa: 'DOCENTE' }])}>
            Agregar usuario
          </Button>
          <Button type="button" variant="secondary" onClick={() => onChange([...value, { user_id: null, nombre: '', cargo: '', representa: 'PADRES' }])}>
            Agregar integrante externo
          </Button>
        </div>
      )}
    </div>
  );
}
