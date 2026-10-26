import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { OpcionesTarjeta } from '../ui/OpcionesTarjeta';
import { Spinner } from '../ui/Spinner';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import type { TipoIngreso } from '../../types/domain';

export type TraeTodos = '' | 'SI' | 'NO';

/** La pregunta que decide si la matrícula nace definitiva o condicional; la comparten «Nueva matrícula» y la formalización de una preinscrita. */
export function PreguntaTraeTodos({ value, onChange }: { value: TraeTodos; onChange: (valor: TraeTodos) => void }) {
  return (
    <OpcionesTarjeta<TraeTodos>
      label="¿El acudiente trae todos los documentos obligatorios?"
      value={value}
      onChange={onChange}
      options={[
        { value: 'SI', titulo: 'Sí, los trae todos', ejemplo: 'Matrícula definitiva. Verificas los originales y luego subes los archivos.' },
        { value: 'NO', titulo: 'No, falta alguno', ejemplo: 'Matrícula condicional con acta de compromiso y fecha límite.' },
      ]}
    />
  );
}

interface Props {
  groupId: string;
  tipoIngreso: TipoIngreso;
  studentId?: string;
  traeTodos: TraeTodos;
  onChange: (valor: TraeTodos) => void;
}

/**
 * Lo que se le pide al estudiante y una sola pregunta: ¿el acudiente trae todos los documentos obligatorios? Con «sí» la matrícula nace definitiva, esos
 * documentos quedan verificados en físico y al guardar se abre el expediente para cargar los archivos; con «no» nace condicional con acta de compromiso y lo
 * que llegue después se marca o se sube en el expediente. Lo que cubre el paz y salvo ya confirmado lo aprueba el sistema y no cuenta.
 */
export function DocumentosPrevistos({ groupId, tipoIngreso, studentId, traeTodos, onChange }: Props) {
  const consulta = useDocumentosPrevistos({ group_id: groupId || undefined, tipo_ingreso: tipoIngreso, student_id: studentId || undefined });
  const previstos = consulta.data ?? [];
  const obligatorios = previstos.filter((d) => d.obligatorio && !d.ya_cubierto);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos de la matrícula</h4>
      {!groupId && <p className="text-xs text-muted">Mostrando requisitos base. Al elegir un grupo se complementan los documentos específicos de su grado.</p>}
      {consulta.isLoading && <Spinner />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.data && (
        <ul className="space-y-1">
          {previstos.map((d) => (
            <li key={d.tipo_documento} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink">{d.nombre}</span>
              {d.ya_cubierto ? <Chip tone="green">Paz y salvo ya confirmado</Chip> : <Chip tone={d.obligatorio ? 'blue' : 'neutral'}>{d.obligatorio ? 'Obligatorio' : 'Opcional'}</Chip>}
            </li>
          ))}
        </ul>
      )}
      {consulta.data &&
        (obligatorios.length === 0 ? (
          <Alert tone="success">No hay documentos obligatorios por recibir: la matrícula queda definitiva.</Alert>
        ) : (
          <PreguntaTraeTodos value={traeTodos} onChange={onChange} />
        ))}
    </div>
  );
}
