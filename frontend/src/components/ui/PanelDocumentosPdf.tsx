import { type ReactNode, useState } from 'react';
import { Card } from './Card';
import { Select } from './Field';
import { VistaPreviaPdf } from './VistaPreviaPdf';

export interface DocumentoPanelPdf {
  /** Único dentro del panel: también es la clave con la que se cachea el PDF. */
  clave: string;
  titulo: string;
  nombreArchivo: string;
  /** Pide el PDF con la sesión del usuario (nunca por URL directa) y devuelve su blob. */
  cargar: () => Promise<{ url: string; blob: Blob }>;
  /** Agrupa las opciones del selector (p. ej. «Plan de área aprobado» y «Documentos de apoyo»). */
  grupo?: string;
}

interface PanelDocumentosPdfProps {
  documentos: DocumentoPanelPdf[];
  /** Lo que se muestra cuando no hay ningún documento que consultar. */
  vacio?: ReactNode;
  /** Alto del visor; por defecto 60% de la pantalla, para convivir con un formulario al lado. */
  altoVisor?: string;
}

/**
 * Panel lateral para leer PDF mientras se trabaja en otra cosa: un selector con los documentos disponibles y el visor del elegido.
 * Lo usan el plan de área (documentos de apoyo), el plan de aula (plan de área aprobado y apoyos del grado) y las actividades (plan de
 * aula aprobado). Cada PDF se pide con la sesión y solo cuando se abre.
 */
export function PanelDocumentosPdf({ documentos, vacio, altoVisor = 'h-[60vh]' }: PanelDocumentosPdfProps) {
  const [elegida, setElegida] = useState<string | null>(null);
  const actual = documentos.find((d) => d.clave === elegida) ?? documentos[0];

  if (!actual) {
    return (
      <Card>
        <p className="text-sm text-muted">{vacio ?? 'No hay documentos para consultar.'}</p>
      </Card>
    );
  }

  const grupos = [...new Set(documentos.map((d) => d.grupo))];

  return (
    <div className="space-y-3">
      {documentos.length > 1 && (
        <Select label="Documento" value={actual.clave} onChange={(e) => setElegida(e.target.value)}>
          {grupos.map((grupo) => {
            const opciones = documentos.filter((d) => d.grupo === grupo);
            const lista = opciones.map((d) => (
              <option key={d.clave} value={d.clave}>
                {d.titulo}
              </option>
            ));
            return grupo ? (
              <optgroup key={grupo} label={grupo}>
                {lista}
              </optgroup>
            ) : (
              lista
            );
          })}
        </Select>
      )}
      <VistaPreviaPdf
        key={actual.clave}
        claveConsulta={['panel-pdf', actual.clave]}
        cargar={actual.cargar}
        nombreArchivo={actual.nombreArchivo}
        titulo={actual.titulo}
        altoVisor={altoVisor}
      />
    </div>
  );
}
