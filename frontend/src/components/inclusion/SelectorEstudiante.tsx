import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { type EstudianteBuscado, useEstudiantesInclusion, useGruposInclusion } from '../../hooks/useInclusion';

/**
 * Busca estudiantes dentro del alcance del usuario (sus sedes o los grupos del docente). No abre el directorio general de
 * estudiantes: el servidor acota la búsqueda, igual que en el observador de convivencia.
 */
export function SelectorEstudiante({ seleccionado, onSelect }: { seleccionado: EstudianteBuscado | null; onSelect: (e: EstudianteBuscado | null) => void }) {
  const [grupo, setGrupo] = useState('');
  const [texto, setTexto] = useState('');
  const grupos = useGruposInclusion();
  const estudiantes = useEstudiantesInclusion(grupo, texto);

  if (seleccionado) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-primary-soft p-3 text-sm">
        <span className="text-ink">
          <span className="font-semibold">
            {seleccionado.apellido} {seleccionado.nombre}
          </span>
          <span className="block text-xs text-muted">
            {seleccionado.numero_documento} · {seleccionado.grupo}
          </span>
        </span>
        <button type="button" className="text-xs font-semibold text-primary" onClick={() => onSelect(null)}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Select label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
        <option value="">Todos mis grupos (escribe al menos 3 letras)</option>
        {(grupos.data ?? []).map((g) => (
          <option key={g._id} value={g._id}>
            {g.grado} — {g.nomenclatura}
          </option>
        ))}
      </Select>
      <Input label="Nombre o documento" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Morales" />
      {estudiantes.isFetching && <Spinner />}
      {estudiantes.isError && <Alert tone="error">{errorMessage(estudiantes.error)}</Alert>}
      <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {(estudiantes.data ?? []).map((e) => (
          <li key={e.student_id}>
            <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-soft" onClick={() => onSelect(e)}>
              <span className="font-semibold text-ink">
                {e.apellido} {e.nombre}
              </span>
              <span className="block text-xs text-muted">
                {e.numero_documento} · {e.grupo}
              </span>
            </button>
          </li>
        ))}
        {(estudiantes.data ?? []).length === 0 && <li className="px-3 py-2 text-sm text-muted">Selecciona un grupo o escribe para buscar.</li>}
      </ul>
    </div>
  );
}
