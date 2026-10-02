import { useState } from 'react';
import { CuadriculaAsistencia } from '../components/asistencia/CuadriculaAsistencia';
import { ExcelAsistencia } from '../components/asistencia/ExcelAsistencia';
import { PlanillaAula } from '../components/asistencia/PlanillaAula';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { descargarPdfAsistencia, useClasesAsistencia, useCuadricula, usePlanilla } from '../hooks/useAsistencia';

/** Hoy en Colombia (UTC-5) como YYYY-MM-DD: el día de calendario que ve el docente, no el de UTC. */
function hoyColombia(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function desplazarMes(mes: string, delta: number): string {
  const [anio, numero] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(anio, numero - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * CU-DOC-04: el docente abre una de sus clases (M08) y ve la planilla del mes como la de papel, o toma lista de un día.
 * Si dirige un grupo, también consulta (sin editar) las demás asignaturas de ese grupo.
 */
export function AsistenciaPage() {
  const { anio } = useAnioDeTrabajo();
  const { data: clases = [], isLoading: cargandoClases } = useClasesAsistencia(anio?._id);

  const [claseKey, setClaseKey] = useState('');
  const [pestana, setPestana] = useState('planilla');
  const [mes, setMes] = useState(() => hoyColombia().slice(0, 7));
  const [fecha, setFecha] = useState(hoyColombia);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  const clase = clases.find((c) => `${c.group_id}|${c.subject_id}` === claseKey);
  const pestanaActiva = clase && !clase.editable ? 'planilla' : pestana;

  const cuadricula = useCuadricula({ group_id: clase?.group_id, subject_id: clase?.subject_id, mes });
  const planilla = usePlanilla({
    group_id: clase?.editable && pestanaActiva === 'diario' ? clase.group_id : undefined,
    subject_id: clase?.editable && pestanaActiva === 'diario' ? clase.subject_id : undefined,
    fecha,
  });

  const periodoDelMes = cuadricula.data?.dias[0]?.periodo_numero;

  async function descargarPdf(consulta: { mes?: string; periodo_numero?: number }, sufijo: string) {
    if (!clase) return;
    setErrorPdf(null);
    try {
      await descargarPdfAsistencia(
        'planilla',
        { group_id: clase.group_id, subject_id: clase.subject_id, ...consulta },
        `planilla-${clase.grupo}-${clase.asignatura}-${sufijo}.pdf`
      );
    } catch (error) {
      setErrorPdf(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asistencia"
        subtitle="Planilla de asistencia de tus clases, mes a mes, y registro de un día con sus novedades."
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <Select label="Clase" value={claseKey} onChange={(e) => setClaseKey(e.target.value)} disabled={cargandoClases}>
            <option value="">Selecciona una clase…</option>
            {clases.map((c) => (
              <option key={`${c.group_id}|${c.subject_id}`} value={`${c.group_id}|${c.subject_id}`}>
                {c.grupo} · {c.asignatura}
                {c.editable ? '' : ` — ${c.docente} (consulta)`}
              </option>
            ))}
          </Select>
          {pestanaActiva === 'planilla' ? (
            <div>
              <span className="mb-1.5 block text-label text-body">Mes</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" aria-label="Mes anterior" onClick={() => setMes(desplazarMes(mes, -1))}>
                  ‹
                </Button>
                <Input label="Mes" hideLabel type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
                <Button type="button" variant="secondary" aria-label="Mes siguiente" onClick={() => setMes(desplazarMes(mes, 1))}>
                  ›
                </Button>
              </div>
            </div>
          ) : (
            <Input label="Fecha" type="date" value={fecha} max={hoyColombia()} onChange={(e) => setFecha(e.target.value)} />
          )}
        </div>
      </Card>

      {!cargandoClases && clases.length === 0 && (
        <Alert tone="info">No tienes clases asignadas en el año lectivo vigente. Coordinación las asigna en Carga académica.</Alert>
      )}

      {clase && (
        <>
          <Tabs
            items={[
              { key: 'planilla', label: 'Planilla del mes' },
              ...(clase.editable ? [{ key: 'diario', label: 'Registro diario' }] : []),
            ]}
            active={pestanaActiva}
            onChange={setPestana}
          />

          <TabPanel active={pestanaActiva} tabKey="planilla">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" disabled={!cuadricula.data || cuadricula.data.dias.length === 0} onClick={() => void descargarPdf({ mes }, mes)}>
                  PDF del mes
                </Button>
                <Button type="button" variant="outline" disabled={!periodoDelMes} onClick={() => void descargarPdf({ periodo_numero: periodoDelMes }, `periodo-${periodoDelMes}`)}>
                  PDF del periodo{periodoDelMes ? ` ${periodoDelMes}` : ''}
                </Button>
              </div>
              {errorPdf && <Alert tone="error">{errorPdf}</Alert>}
              {cuadricula.isLoading && (
                <div className="flex justify-center p-8">
                  <Spinner />
                </div>
              )}
              {cuadricula.isError && <Alert tone="error">{errorMessage(cuadricula.error)}</Alert>}
              {cuadricula.data && (
                <CuadriculaAsistencia
                  key={`${clase.group_id}-${clase.subject_id}-${mes}`}
                  cuadricula={cuadricula.data}
                  onAbrirDia={
                    clase.editable
                      ? (dia) => {
                          setFecha(dia);
                          setPestana('diario');
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </TabPanel>

          <TabPanel active={pestanaActiva} tabKey="diario">
            <div className="space-y-4">
              <ExcelAsistencia planilla={planilla.data} />
              {planilla.isLoading && (
                <div className="flex justify-center p-8">
                  <Spinner />
                </div>
              )}
              {planilla.isError && <Alert tone="error">{errorMessage(planilla.error)}</Alert>}
              {planilla.data && <PlanillaAula key={`${clase.group_id}-${clase.subject_id}-${fecha}`} planilla={planilla.data} />}
            </div>
          </TabPanel>
        </>
      )}
    </div>
  );
}
