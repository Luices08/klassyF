import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useEnrollment } from '../../hooks/useEnrollments';
import { nombreDeItem, soloVerificadoEnFisico, type ChecklistItem } from '../../types/domain';
import { PreguntaTraeTodos, type TraeTodos } from './DocumentosPrevistos';

/** Cómo está cada documento de una matrícula preinscrita, en palabras de quien matricula. */
function estadoDelDocumento(c: ChecklistItem): { texto: string; tone: Tone } {
  if (c.estado === 'APROBADO') return soloVerificadoEnFisico(c) ? { texto: 'Verificado en físico · sin archivo', tone: 'orange' } : { texto: 'Aprobado', tone: 'green' };
  if (c.estado === 'CARGADO') return { texto: c.cargado_por_tipo === 'FAMILIA' ? 'Subido por la familia · por revisar' : 'Ya subido · por revisar', tone: 'blue' };
  if (c.estado === 'RECHAZADO') return { texto: 'Rechazado', tone: 'red' };
  return { texto: 'Sin subir', tone: 'neutral' };
}

/**
 * Formalizar una matrícula preinscrita: muestra qué documentos ya están subidos o aprobados (los que cargó la solicitud, la familia o secretaría) y hace
 * la misma pregunta de «Nueva matrícula». Con «sí», lo que tenga archivo se aprueba al ver el original y lo demás queda verificado en físico.
 */
export function DocumentosDeLaPreinscrita({ matriculaId, traeTodos, onChange }: { matriculaId: string; traeTodos: TraeTodos; onChange: (valor: TraeTodos) => void }) {
  const { data: matricula, isLoading, isError, error } = useEnrollment(matriculaId);
  const items = matricula?.checklist ?? [];
  const porAprobar = items.filter((c) => c.obligatorio !== false && c.estado !== 'APROBADO');

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos de la matrícula</h4>
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {matricula && (
        <>
          <ul className="space-y-1">
            {items.map((c) => {
              const e = estadoDelDocumento(c);
              return (
                <li key={c.tipo_documento} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ink">
                    {nombreDeItem(c)}
                    {c.obligatorio === false && <span className="ml-1 text-xs text-muted">(opcional)</span>}
                  </span>
                  <Chip tone={e.tone}>{e.texto}</Chip>
                </li>
              );
            })}
          </ul>
          {porAprobar.length === 0 ? (
            <Alert tone="success">Todos los documentos obligatorios ya están aprobados: la matrícula queda definitiva.</Alert>
          ) : (
            <PreguntaTraeTodos value={traeTodos} onChange={onChange} />
          )}
        </>
      )}
    </div>
  );
}
