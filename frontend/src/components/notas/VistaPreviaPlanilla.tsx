import { useState } from 'react';
import { descargarExcelDeMuestra, useVistaPreviaMolde } from '../../hooks/useNotas';
import type { AcademicYear } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { PlanillaNotas } from './PlanillaNotas';

/**
 * Cómo recibirá el docente su planilla (CU-ADM-04): el molde guardado del año y la plantilla de impresión, con tres estudiantes y
 * dos casillas por bloque de ejemplo para ver cómo se calculan los promedios. Es la misma pantalla que usa el docente, en solo
 * consulta, y el mismo Excel que baja el docente, con la marca de muestra para que no se pueda subir como la planilla de una clase.
 */
export function VistaPreviaPlanilla({ anio }: { anio: AcademicYear }) {
  const vista = useVistaPreviaMolde(anio._id);
  const [bajando, setBajando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  async function descargar() {
    setErrorDescarga(null);
    setBajando(true);
    try {
      await descargarExcelDeMuestra(anio._id);
    } catch (error) {
      setErrorDescarga(errorMessage(error));
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Así verá el docente su planilla"
          subtitle="Con el molde y la impresión que están guardados. Los estudiantes, casillas y notas son de ejemplo: no existen en el sistema."
          action={
            <Button type="button" variant="outline" isLoading={bajando} onClick={() => void descargar()}>
              Descargar Excel de muestra
            </Button>
          }
        />
        <p className="text-xs text-muted">
          El Excel de muestra trae el mismo formato que recibe el docente (bloques, casillas disponibles, pesos y fórmulas). Sirve para revisarlo o compartirlo, pero no se puede subir como planilla: cada docente descarga la
          de su clase desde «Planilla de notas». Si cambias el molde o la impresión, vuelve a esta pestaña para ver el resultado.
        </p>
      </Card>

      {errorDescarga && <Alert tone="error">{errorDescarga}</Alert>}
      {vista.isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {vista.isError && <Alert tone="error">{errorMessage(vista.error)}</Alert>}
      {vista.data && <PlanillaNotas planilla={vista.data} />}
    </div>
  );
}
