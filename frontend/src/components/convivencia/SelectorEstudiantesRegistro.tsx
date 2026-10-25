import { useState } from 'react';
import { Input } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { type EstudianteObservable, useEstudiantesObservables, useGruposObservables } from '../../hooks/useObservaciones';

interface Props {
  seleccion: EstudianteObservable[];
  onChange: (seleccion: EstudianteObservable[]) => void;
}

/**
 * Elegir a quién se registra sin salir del formulario: se escoge el grupo (de toda la sede: quien ve algo lo registra, aunque no dicte en ese grupo)
 * o se busca por nombre, y la selección sobrevive al cambio de grupo para un incidente entre estudiantes de grupos distintos.
 */
export function SelectorEstudiantesRegistro({ seleccion, onChange }: Props) {
  const grupos = useGruposObservables();
  const [grupoId, setGrupoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const estudiantes = useEstudiantesObservables({ group_id: grupoId || undefined, q: busqueda });

  const elegidos = new Set(seleccion.map((s) => s.student_id));
  const alternar = (estudiante: EstudianteObservable) =>
    onChange(elegidos.has(estudiante.student_id) ? seleccion.filter((s) => s.student_id !== estudiante.student_id) : [...seleccion, estudiante]);
  const lista = estudiantes.data ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectBuscable
          label="Grupo"
          value={grupoId}
          onChange={setGrupoId}
          placeholder="Buscar grado o grupo…"
          vacioLabel="Todos (usa la búsqueda por nombre)"
          opciones={(grupos.data ?? []).map((g) => ({ value: g._id, label: `${g.grado} · ${g.nomenclatura}${g.es_director ? ' (director)' : ''}` }))}
        />
        <Input label="Buscar por nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Mínimo 3 letras" />
      </div>

      {(grupoId || busqueda.trim().length >= 3) && (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
          {estudiantes.isFetching && lista.length === 0 && (
            <li className="flex justify-center px-3 py-3">
              <Spinner />
            </li>
          )}
          {lista.map((s) => (
            <li key={s.student_id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-body hover:bg-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  checked={elegidos.has(s.student_id)}
                  onChange={() => alternar(s)}
                />
                <span className="flex-1">
                  {s.apellido} {s.nombre}
                </span>
                <span className="text-xs text-muted">{s.grupo}</span>
              </label>
            </li>
          ))}
          {!estudiantes.isFetching && lista.length === 0 && <li className="px-3 py-2 text-muted">Sin resultados.</li>}
        </ul>
      )}

      {seleccion.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-body">Seleccionados ({seleccion.length}):</span>
          {seleccion.map((s) => (
            <span key={s.student_id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs text-primary">
              {s.apellido} {s.nombre} · {s.grupo}
              <button type="button" className="font-semibold hover:text-ink" aria-label={`Quitar a ${s.nombre} ${s.apellido}`} onClick={() => alternar(s)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">Elige un grupo y marca a los estudiantes, o búscalos por nombre.</p>
      )}
    </div>
  );
}
