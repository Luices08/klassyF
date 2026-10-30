import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { OpcionesTarjeta } from '../ui/OpcionesTarjeta';
import { Spinner } from '../ui/Spinner';
import { UploadIcon } from '../ui/icons';
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
  groupId?: string;
  gradeId?: string;
  tipoIngreso: TipoIngreso;
  studentId?: string;
  traeTodos: TraeTodos;
  onChange: (valor: TraeTodos) => void;
  archivos?: Record<string, File>;
  onArchivoChange?: (tipo: string, file: File | null) => void;
}

/**
 * Lo que se le pide al estudiante y la selección de entrega física:
 * Permite cargar directamente cada archivo si se cuenta con él, o bien marcar con las dos tarjetas
 * si trae todos los documentos o falta alguno (para cuando no se deseen adjuntar archivos en el momento).
 */
export function DocumentosPrevistos({ groupId, gradeId, tipoIngreso, studentId, traeTodos, onChange, archivos, onArchivoChange }: Props) {
  const consulta = useDocumentosPrevistos({
    group_id: groupId || undefined,
    grade_id: gradeId || undefined,
    tipo_ingreso: tipoIngreso,
    student_id: studentId || undefined,
  });
  const previstos = consulta.data ?? [];
  const obligatorios = previstos.filter((d) => d.obligatorio && !d.ya_cubierto);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos de la matrícula</h4>
      {!groupId && !gradeId && (
        <p className="text-xs text-muted">Mostrando requisitos base. Al elegir un grado o grupo se complementan los documentos específicos.</p>
      )}
      {consulta.isLoading && <Spinner />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.data && (
        <ul className="divide-y divide-border">
          {previstos.map((d) => {
            const archivo = archivos?.[d.tipo_documento];
            return (
              <li key={d.tipo_documento} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{d.nombre}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {d.ya_cubierto ? (
                      <Chip tone="green">Paz y salvo ya confirmado</Chip>
                    ) : (
                      <Chip tone={d.obligatorio ? 'blue' : 'neutral'}>{d.obligatorio ? 'Obligatorio' : 'Opcional'}</Chip>
                    )}
                  </div>
                </div>

                {!d.ya_cubierto && onArchivoChange && (
                  <div className="shrink-0">
                    {archivo ? (
                      <div className="flex items-center gap-2">
                        <Chip tone="green">Adjunto</Chip>
                        <span className="max-w-[130px] sm:max-w-[170px] truncate text-xs text-ink" title={archivo.name}>
                          {archivo.name}
                        </span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-danger hover:underline"
                          onClick={() => onArchivoChange(d.tipo_documento, null)}
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <label
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body transition hover:bg-border/80 hover:text-primary"
                        title={`Adjuntar ${d.nombre}`}
                      >
                        <UploadIcon className="h-4 w-4" />
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,image/png,image/jpeg,image/webp"
                          aria-label={`Adjuntar ${d.nombre}`}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onArchivoChange(d.tipo_documento, f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
