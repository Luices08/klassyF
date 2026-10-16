import { useState } from 'react';
import { AdoptarPlanDrawer } from '../components/planeacion/AdoptarPlanDrawer';
import { DetallePlanDrawer } from '../components/planeacion/DetallePlanDrawer';
import { PlanAreaDrawer } from '../components/planeacion/PlanAreaDrawer';
import { PlanAulaDrawer } from '../components/planeacion/PlanAulaDrawer';
import { TarjetaPlanAulaCard } from '../components/planeacion/TarjetaPlanAulaCard';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoPlanBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useContadoresDePestana } from '../hooks/useNotificaciones';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { usePlanesArea } from '../hooks/usePlanesArea';
import { useMisPlanesAula } from '../hooks/usePlanesAula';
import { formatoFechaHora } from '../lib/fechas';
import { nombreDePersona, textoUltimoEnvio } from '../lib/planeacion';
import type { FilaPlanArea, PeriodoTarjetaPlanAula, PlanAdoptable, TarjetaPlanAula } from '../types/domain';

interface ObjetivoAula {
  tarjeta: TarjetaPlanAula;
  periodo: PeriodoTarjetaPlanAula;
}

/**
 * M07, vista del docente. «Planes de aula»: una carpeta por asignatura y grado que dicta, con un plan (PDF + título + descripción) por
 * periodo. «Plan de área»: solo si es líder de alguna área, donde carga el plan anual. Ambos se revisan por coordinación; el formulario
 * de reenvío sigue disponible mientras coordinación devuelva el plan con comentarios, hasta que se apruebe.
 */
export function PlaneacionDocentePage() {
  const { anio: anioDeTrabajo, anios } = useAnioDeTrabajo();
  const [anioElegido, setAnioElegido] = useState('');
  const anio = anios.find((a) => a._id === anioElegido) ?? anioDeTrabajo;

  const misPlanes = useMisPlanesAula(anio?._id);
  const planesArea = usePlanesArea(anio?._id);
  const filasQueLidero = (planesArea.data ?? []).filter((f) => f.soy_lider);

  const [pestana, setPestana] = useState('aula');
  const contadorDe = useContadoresDePestana('/docente/planeacion', pestana);
  const [cargandoAula, setCargandoAula] = useState<ObjetivoAula | null>(null);
  const [adoptando, setAdoptando] = useState<(ObjetivoAula & { plan: PlanAdoptable }) | null>(null);
  const [cargandoArea, setCargandoArea] = useState<FilaPlanArea | null>(null);
  const [viendo, setViendo] = useState<{ tipo: 'AREA' | 'AULA'; id: string } | null>(null);

  const pestanas = [{ key: 'aula', label: 'Planes de aula', contador: contadorDe('aula') }, ...(filasQueLidero.length > 0 ? [{ key: 'area', label: 'Plan de área', contador: contadorDe('area') }] : [])];
  const areasPendientes = filasQueLidero.filter((f) => f.vigente && (f.estado === 'SIN_CARGAR' || f.estado === 'DEVUELTO'));
  const nombresDeAreasPendientes = [...new Set(areasPendientes.map((f) => f.area.nombre))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Planeación"
        subtitle="Tu plan de aula de cada periodo y, si lideras un área, su plan anual: en PDF, con título y descripción, y revisados por coordinación."
      />

      {anios.length > 1 && (
        <div className="max-w-xs">
          <Select label="Año lectivo" value={anio?._id ?? ''} onChange={(e) => setAnioElegido(e.target.value)}>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
                {a.estado === 'EN_CURSO' ? ' (vigente)' : a.estado === 'CERRADO' ? ' (histórico)' : ''}
              </option>
            ))}
          </Select>
        </div>
      )}
      {anio?.estado === 'CERRADO' && <Alert tone="info">Estás consultando un año cerrado: es un histórico de solo lectura.</Alert>}
      {areasPendientes.length > 0 && pestana !== 'area' && anio?.estado !== 'CERRADO' && (
        <Alert tone="warning">
          Eres líder de {nombresDeAreasPendientes.join(', ')} y su plan de área está pendiente.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setPestana('area')}>
            Ir al plan de área
          </button>
        </Alert>
      )}

      {pestanas.length > 1 && <Tabs items={pestanas} active={pestana} onChange={setPestana} />}

      <TabPanel active={pestana} tabKey="aula">
        <div className="space-y-4">
          {misPlanes.isLoading && <Spinner label="Cargando tus clases..." />}
          {misPlanes.isError && <Alert tone="error">{errorMessage(misPlanes.error)}</Alert>}
          {misPlanes.data && misPlanes.data.tarjetas.length === 0 && (
            <Alert tone="info">No tienes clases asignadas en este año lectivo. Coordinación las asigna en Carga académica.</Alert>
          )}
          {misPlanes.data?.tarjetas.map((tarjeta) => (
            <TarjetaPlanAulaCard
              key={`${tarjeta.asignatura._id}-${tarjeta.grado._id}`}
              tarjeta={tarjeta}
              onCargar={(periodo) => setCargandoAula({ tarjeta, periodo })}
              onVer={(id) => setViendo({ tipo: 'AULA', id })}
              onAdoptar={(periodo, plan) => setAdoptando({ tarjeta, periodo, plan })}
            />
          ))}
        </div>
      </TabPanel>

      <TabPanel active={pestana} tabKey="area">
        <div className="space-y-4">
          {filasQueLidero.map((fila) => (
            <Card key={fila.clave} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-label uppercase tracking-wide text-muted">Líder del área</p>
                  <h2 className="text-h3 text-ink">{fila.area.nombre}</h2>
                  {fila.alcance && <p className="text-sm text-muted">{fila.alcance.texto}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!fila.vigente && <Chip tone="neutral">Ya no lideras esta parte</Chip>}
                  {fila.obligatoria && <Chip tone="blue">Área obligatoria</Chip>}
                  <EstadoPlanBadge value={fila.estado} />
                </div>
              </div>

              {fila.plan && (
                <div className="space-y-1">
                  <p className="font-semibold text-ink">{fila.plan.titulo}</p>
                  <p className="text-sm text-body">{fila.plan.descripcion}</p>
                  <p className="text-xs text-muted">{textoUltimoEnvio(fila.plan.radicado_en, fila.plan.version_actual)}</p>
                </div>
              )}
              {fila.estado === 'DEVUELTO' && fila.plan?.ultima_revision && (
                <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                  <p className="font-semibold">{fila.plan.ultima_revision.accion === 'REABIERTO' ? 'Un administrador lo reabrió' : 'Coordinación lo devolvió'}:</p>
                  <p className="whitespace-pre-line">{fila.plan.ultima_revision.comentario}</p>
                  <p className="mt-1 text-xs">
                    {nombreDePersona(fila.plan.ultima_revision.revisor)} · {formatoFechaHora(fila.plan.ultima_revision.fecha)}
                  </p>
                </div>
              )}
              {fila.estado === 'SIN_CARGAR' && (
                <p className="text-sm text-muted">
                  Aún no has cargado el plan de {fila.area.nombre}. Hasta que coordinación lo apruebe, los docentes del área no pueden cargar su plan de aula.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {fila.puede.cargar && (
                  <Button type="button" onClick={() => setCargandoArea(fila)}>
                    {fila.estado === 'DEVUELTO' ? 'Responder observaciones' : 'Cargar plan de área'}
                  </Button>
                )}
                {fila.plan && fila.puede.ver_archivo && (
                  <Button type="button" variant="secondary" onClick={() => setViendo({ tipo: 'AREA', id: fila.plan!._id })}>
                    Ver plan
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </TabPanel>

      {anio && cargandoAula && (
        <PlanAulaDrawer
          key={`${cargandoAula.tarjeta.asignatura._id}-${cargandoAula.periodo.numero}`}
          open
          onClose={() => setCargandoAula(null)}
          anioId={anio._id}
          tarjeta={cargandoAula.tarjeta}
          periodo={cargandoAula.periodo}
        />
      )}
      {anio && cargandoArea && <PlanAreaDrawer key={cargandoArea.clave} open onClose={() => setCargandoArea(null)} anioId={anio._id} fila={cargandoArea} />}
      <AdoptarPlanDrawer
        plan={adoptando?.plan ?? null}
        contexto={adoptando ? `${adoptando.tarjeta.asignatura.nombre} · ${adoptando.tarjeta.grado.nombre} · ${adoptando.periodo.nombre}` : ''}
        onClose={() => setAdoptando(null)}
        onSubirAjustado={() => {
          if (adoptando) setCargandoAula({ tarjeta: adoptando.tarjeta, periodo: adoptando.periodo });
        }}
      />
      <DetallePlanDrawer tipo={viendo?.tipo ?? 'AULA'} id={viendo?.id ?? null} onClose={() => setViendo(null)} />
    </div>
  );
}
