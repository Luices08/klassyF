import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { UploadIcon } from '../ui/icons';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import { entregadosVigentes, obligatoriosSinEntregar } from '../../lib/entregaDocumentos';
import type { TipoIngreso } from '../../types/domain';

interface Props {
  groupId: string;
  tipoIngreso: TipoIngreso;
  studentId?: string;
  /** Claves de los documentos que el acudiente trajo en físico y secretaría verificó. */
  entregados: string[];
  onEntregadosChange: (claves: string[]) => void;
  archivos?: Record<string, File>;
  onArchivoChange?: (tipoDoc: string, file: File | null) => void;
}

/**
 * Lo que se le pide al estudiante y lo que secretaría tiene en la mano. Se marca documento por documento (o «todos los obligatorios»): si no falta
 * ningún obligatorio la matrícula nace definitiva, y si falta alguno, condicional con acta de compromiso. Lo marcado queda aprobado sin archivo y
 * pasa a «Por digitalizar»; adjuntar el archivo aquí es opcional.
 */
export function DocumentosPrevistos({ groupId, tipoIngreso, studentId, entregados, onEntregadosChange, archivos = {}, onArchivoChange }: Props) {
  const navigate = useNavigate();
  const consulta = useDocumentosPrevistos({ group_id: groupId || undefined, tipo_ingreso: tipoIngreso, student_id: studentId || undefined });
  const previstos = consulta.data ?? [];
  const vigentes = entregadosVigentes(previstos, entregados);
  const faltantes = obligatoriosSinEntregar(previstos, vigentes);
  const obligatoriosPorMarcar = previstos.filter((d) => d.obligatorio && !d.ya_cubierto);

  function alternar(clave: string, marcado: boolean) {
    onEntregadosChange(marcado ? [...new Set([...vigentes, clave])] : vigentes.filter((k) => k !== clave));
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Documentos que entregó el acudiente</h4>
        {consulta.data &&
          (faltantes.length === 0 ? (
            <Chip tone="green">Entrega completa · matrícula definitiva</Chip>
          ) : (
            <Chip tone="orange">{`Falta${faltantes.length === 1 ? '' : 'n'} ${faltantes.length} obligatorio${faltantes.length === 1 ? '' : 's'} · matrícula condicional`}</Chip>
          ))}
      </div>
      {!groupId && (
        <p className="text-xs text-muted">Mostrando requisitos base. Al seleccionar un grupo se complementarán los documentos específicos de su grado.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={obligatoriosPorMarcar.length === 0}
          onClick={() => onEntregadosChange([...new Set([...vigentes, ...obligatoriosPorMarcar.map((d) => d.tipo_documento)])])}
        >
          Marcar todos los obligatorios
        </Button>
        <Button type="button" variant="secondary" disabled={vigentes.length === 0} onClick={() => onEntregadosChange([])}>
          Quitar marcas
        </Button>
      </div>
      {consulta.isLoading && <Spinner />}
      {consulta.isError && <Alert tone="error">{errorMessage(consulta.error)}</Alert>}
      {consulta.data && (
        <Table>
          <TableHead>
            <Th>Documento</Th>
            <Th>Lo tengo en físico</Th>
            <Th>Archivo digital (opcional)</Th>
          </TableHead>
          <TableBody>
            {previstos.map((d) => {
              const archivo = archivos[d.tipo_documento];
              const marcado = vigentes.includes(d.tipo_documento);
              return (
                <tr key={d.tipo_documento}>
                  <Td>
                    <div className="font-medium text-ink">{d.nombre}</div>
                    <div className="text-xs text-muted">{d.obligatorio ? 'Obligatorio' : 'Opcional'}</div>
                  </Td>
                  <Td>
                    {d.ya_cubierto ? (
                      <Chip tone="green">Paz y salvo ya confirmado</Chip>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Recibí en físico: ${d.nombre}`}
                        checked={marcado}
                        onChange={(e) => alternar(d.tipo_documento, e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                    )}
                  </Td>
                  <Td>
                    {onArchivoChange ? (
                      archivo ? (
                        <div className="flex items-center gap-1.5">
                          <Chip tone="green">Adjunto</Chip>
                          <span className="max-w-[130px] truncate text-xs text-ink" title={archivo.name}>
                            {archivo.name}
                          </span>
                          <button
                            type="button"
                            title="Quitar archivo"
                            onClick={() => onArchivoChange(d.tipo_documento, null)}
                            className="text-xs font-semibold text-danger hover:underline"
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <label
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-soft text-body shadow-xs transition hover:bg-border/80 hover:text-primary"
                          title="Adjuntar archivo digital (opcional)"
                        >
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/png,image/jpeg"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onArchivoChange(d.tipo_documento, f);
                            }}
                          />
                          <UploadIcon className="h-3.5 w-3.5" />
                        </label>
                      )
                    ) : (
                      <Chip tone="neutral">No enviado</Chip>
                    )}
                  </Td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted">
        {faltantes.length === 0
          ? 'Lo marcado queda aprobado como «verificado en físico» y aparece en «Por digitalizar» hasta que subas el archivo; no necesita otra revisión.'
          : 'Los obligatorios sin marcar quedan cubiertos por el acta de compromiso con la fecha pactada. Lo que sí marcaste queda aprobado y por digitalizar.'}
      </p>
      <Button type="button" variant="outline" onClick={() => navigate('/admin/documentos-por-revisar')}>
        Ir a documentos por revisar y digitalizar
      </Button>
    </div>
  );
}
