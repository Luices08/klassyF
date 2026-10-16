import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { TrashIcon } from '../ui/icons';
import { useComentarios, useCrearComentario, useEliminarComentario } from '../../hooks/useActividades';
import { MAX_CARACTERES_COMENTARIO, formatoInstante } from '../../lib/actividades';

const ROL_ETIQUETA: Record<string, string> = { DOCENTE: 'Docente', ESTUDIANTE: 'Estudiante', ADMIN: 'Administración', COORDINADOR: 'Coordinación' };

/** Conversación pública entre el docente y los estudiantes del grupo sobre la actividad (dudas, aclaraciones). */
export function ComentariosActividad({ actividadId, puedeComentar = true }: { actividadId: string; puedeComentar?: boolean }) {
  const comentarios = useComentarios(actividadId);
  const crear = useCrearComentario(actividadId);
  const eliminar = useEliminarComentario(actividadId);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      await crear.mutateAsync(texto.trim());
      setTexto('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function quitar(id: string) {
    if (!window.confirm('¿Eliminar este comentario?')) return;
    setError(null);
    try {
      await eliminar.mutateAsync(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {comentarios.isLoading && <Spinner />}
      {comentarios.isError && <Alert tone="error">{errorMessage(comentarios.error)}</Alert>}
      {comentarios.data?.length === 0 && <p className="text-sm text-muted">Aún no hay comentarios. Aquí se aclaran dudas de la actividad; lo ve todo el grupo.</p>}
      <ul className="space-y-2">
        {(comentarios.data ?? []).map((c) => (
          <li key={c._id} className={`rounded-xl border p-3 ${c.es_mio ? 'border-primary/30 bg-primary-soft/40' : 'border-border bg-surface'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{c.autor ? `${c.autor.nombre} ${c.autor.apellido}` : 'Usuario retirado'}</span>
                <Chip tone={c.autor_rol === 'DOCENTE' ? 'green' : c.autor_rol === 'ESTUDIANTE' ? 'orange' : 'blue'}>{ROL_ETIQUETA[c.autor_rol] ?? c.autor_rol}</Chip>
                <span className="text-xs text-muted">{formatoInstante(c.fecha)}</span>
              </div>
              {c.puede_eliminar && <IconButton tone="danger" label="Eliminar comentario" icon={<TrashIcon />} onClick={() => void quitar(c._id)} />}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-body">{c.texto}</p>
          </li>
        ))}
      </ul>
      {puedeComentar && (
        <div className="space-y-2">
          <Textarea
            label="Escribe un comentario"
            rows={2}
            maxLength={MAX_CARACTERES_COMENTARIO}
            value={texto}
            hint="Lo ven el docente y todo el grupo. No compartas datos personales."
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="button" isLoading={crear.isPending} disabled={texto.trim() === ''} onClick={() => void enviar()}>
              Comentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
