import { useState } from 'react';
import { useDocumentosDelHijo, useSubirDocumentoDelHijo } from '../../hooks/usePortal';
import { AYUDA_ARCHIVO_DOCUMENTO, validarArchivoDocumento } from '../../lib/documentosMatricula';
import { diasHastaFinDelDia, formatoFechaCalendario } from '../../lib/fechas';
import type { TipoDocumentoMatricula } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Card } from '../ui/Card';
import { FilaDocumentoSubible } from '../ui/FilaDocumentoSubible';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';

function EtiquetaPlazo({ limite }: { limite: string }) {
  const dias = diasHastaFinDelDia(limite);
  if (dias < 0) return <Chip tone="red">Plazo vencido</Chip>;
  if (dias === 0) return <Chip tone="orange">Vence hoy</Chip>;
  return <Chip tone={dias <= 3 ? 'orange' : 'green'}>{dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`}</Chip>;
}

/**
 * Documentos de la matrícula del estudiante (M04): qué falta, qué está en revisión y qué rechazó secretaría. El acudiente sube el archivo aquí;
 * queda «En revisión» y aparece en la bandeja «Documentos por revisar» de secretaría, que lo aprueba o lo rechaza con el motivo.
 */
export function PortalDocumentos({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useDocumentosDelHijo(studentId);
  const subir = useSubirDocumentoDelHijo(studentId);
  const [problema, setProblema] = useState<string | null>(null);

  function alElegir(tipoDocumento: TipoDocumentoMatricula, file: File) {
    subir.reset();
    const mal = validarArchivoDocumento(file);
    setProblema(mal);
    if (!mal) subir.mutate({ tipoDocumento, file });
  }

  if (isLoading) return <Spinner />;
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!data) return <Alert tone="info">El estudiante no tiene una matrícula en proceso: no hay documentos por entregar.</Alert>;

  const entregados = data.documentos.filter((d) => d.estado === 'CARGADO' || d.estado === 'APROBADO').length;
  const legalizada = data.matricula_estado === 'MATRICULADO_DEFINITIVO';
  const cancelada = data.matricula_estado === 'RETIRADO' || data.matricula_estado === 'ANULADO';

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h3 text-ink">Documentos de matrícula</h2>
          <p className="text-sm text-muted">
            {data.grado} · Grupo {data.grupo}
          </p>
        </div>
        {data.fecha_limite_legalizacion && !legalizada && !cancelada && (
          <div className="flex items-center gap-2 text-sm text-body">
            Entrégalos antes del {formatoFechaCalendario(data.fecha_limite_legalizacion)}
            <EtiquetaPlazo limite={data.fecha_limite_legalizacion} />
          </div>
        )}
      </div>

      {legalizada && <Alert tone="success">La matrícula está formalizada{data.folio_matricula ? ` (folio ${data.folio_matricula})` : ''}. No hay documentos pendientes.</Alert>}
      {cancelada && <Alert tone="warning">Esta matrícula fue {data.matricula_estado === 'ANULADO' ? 'anulada' : 'retirada'}. Comunícate con la secretaría académica.</Alert>}
      {data.plazo_vencido && <Alert tone="warning">El plazo venció. Comunícate con la secretaría académica para conservar el cupo.</Alert>}

      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{data.pendientes === 0 ? 'No tienes documentos obligatorios por entregar' : `${data.pendientes} obligatorio(s) sin aprobar`}</span>
          <span className="text-muted">
            {entregados} de {data.documentos.length} entregados
          </span>
        </div>
        <ProgressBar value={entregados} max={data.documentos.length} tone={entregados === data.documentos.length ? 'green' : 'blue'} label="Documentos entregados" />
        {data.puede_subir_documentos && <p className="mt-2 text-xs text-muted">{AYUDA_ARCHIVO_DOCUMENTO} La secretaría revisará cada documento y te dirá aquí si lo aprobó o qué debes corregir.</p>}
      </div>

      {(problema || subir.isError) && <Alert tone="error">{problema ?? errorMessage(subir.error)}</Alert>}
      {subir.isSuccess && <Alert tone="success">Documento enviado. Queda en revisión de la secretaría.</Alert>}

      <ul className="divide-y divide-border">
        {data.documentos.map((d) => (
          <FilaDocumentoSubible
            key={d.tipo_documento}
            nombre={d.nombre}
            estado={d.estado}
            comentario={d.comentario}
            indicacion={d.indicacion}
            obligatorio={d.obligatorio}
            editable={d.puede_subir}
            subiendo={subir.isPending && subir.variables?.tipoDocumento === d.tipo_documento}
            onArchivo={(file) => alElegir(d.tipo_documento, file)}
          />
        ))}
      </ul>
    </Card>
  );
}
