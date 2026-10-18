import { useMemo, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { TabPanel, Tabs } from '../ui/Tabs';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import { usePoliticaRecuperacion } from '../../hooks/useRecuperaciones';
import { type PoliticaPromocion, useActualizarPoliticaPromocion, usePoliticaPromocion } from '../../hooks/usePromocion';
import { hayCambios } from '../../lib/cambiosPolitica';
import { ConfirmarCambiosPolitica } from './ConfirmarCambiosPolitica';
import { PanelModeloDecreto1290 } from './PanelModeloDecreto1290';
import { PanelReglasEspeciales } from './PanelReglasEspeciales';
import { ResumenSIEE } from './ResumenSIEE';
import { SimuladorCaso } from './SimuladorCaso';
import { TarjetaEvaluacion } from './TarjetaEvaluacion';
import { TarjetaExcepciones } from './TarjetaExcepciones';
import { TarjetaTextoSiee } from './TarjetaTextoSiee';
import { TarjetaTitulacion } from './TarjetaTitulacion';
import { TarjetaUmbrales } from './TarjetaUmbrales';

interface AnualM18 {
  aplica: boolean;
  max_asignaturas_pendientes: number;
  efecto: string;
}

interface Props {
  academicYearId?: string;
  puedeEditar: boolean;
  /** Nota mínima que aprueba, de la escala del año (3.0 si el año aún no la define). */
  notaAprobatoria?: number;
  /** Cuántos periodos tiene el año. */
  periodos?: number;
}

/**
 * La política de promoción del año (M19): el SIEE del colegio hecho datos, contado en lenguaje de colegio. Tres tarjetas (qué es perder, cuántas se
 * pueden perder, casos especiales), un resumen en frases y un simulador que prueban lo que se está editando. Solo el ADMIN la cambia; la lee cualquiera
 * con sesión. Las faltas de convivencia nunca reprueban: el servidor solo admite «enviar a comisión» o «no renovar el cupo» en esas reglas.
 */
export function PoliticaPromocionPanel({ academicYearId, puedeEditar, notaAprobatoria = 3, periodos = 4 }: Props) {
  const { data, isLoading, isError, error } = usePoliticaPromocion(academicYearId);
  const recuperacion = usePoliticaRecuperacion(academicYearId);
  if (!academicYearId) return <Alert tone="info">No hay un año lectivo configurado.</Alert>;
  if (isLoading || recuperacion.isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return (
    <Formulario
      key={JSON.stringify(data)}
      academicYearId={academicYearId}
      politica={data}
      anualM18={recuperacion.data?.anual}
      puedeEditar={puedeEditar}
      notaAprobatoria={notaAprobatoria}
      periodos={periodos}
    />
  );
}

/**
 * Una política guardada antes de las tarjetas no tiene el tope de recuperación ni el efecto de las imprescindibles; se parte de lo que ya rige
 * (Recuperaciones de M18) para que al guardar por primera vez el directivo vea cada cosa y no cambie nada a escondidas.
 */
function normalizar(politica: PoliticaPromocion, anual?: AnualM18): PoliticaPromocion {
  const copia = structuredClone(politica);
  if (copia.umbrales.recuperacion_hasta === null && anual) {
    if (!anual.aplica) copia.umbrales.recuperacion_hasta = 0;
    else if (anual.max_asignaturas_pendientes > 0) copia.umbrales.recuperacion_hasta = anual.max_asignaturas_pendientes;
    copia.umbrales.efecto_nota_recuperacion = anual.efecto === 'REEMPLAZA' ? 'REEMPLAZA' : 'LIMITA_A_APROBATORIA';
  }
  if (copia.imprescindibles.efecto === null) copia.imprescindibles = { efecto: 'NO_PROMUEVE' };
  return copia;
}

function Formulario({
  academicYearId,
  politica,
  anualM18,
  puedeEditar,
  notaAprobatoria,
  periodos,
}: {
  academicYearId: string;
  politica: PoliticaPromocion;
  anualM18?: AnualM18;
  puedeEditar: boolean;
  notaAprobatoria: number;
  periodos: number;
}) {
  const actualizar = useActualizarPoliticaPromocion(academicYearId);
  const inicial = useMemo(() => normalizar(politica, anualM18), [politica, anualM18]);
  const [b, setB] = useState<PoliticaPromocion>(inicial);
  const [pestana, setPestana] = useState('promocion');
  const [modelo, setModelo] = useState(false);
  const [reglas, setReglas] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error' | 'info'; texto: string } | null>(null);

  const areas = useAreas().data ?? [];
  const asignaturas = useSubjects().data ?? [];
  const nombres = useMemo(() => ({ asignaturas: new Map(asignaturas.map((s) => [s._id, s.nombre])), areas: new Map(areas.map((a) => [a._id, a.nombre])) }), [asignaturas, areas]);

  const bloqueado = !puedeEditar;
  const sucio = hayCambios(inicial, b);

  async function guardar() {
    setMensaje(null);
    const saneado: PoliticaPromocion = {
      ...b,
      umbrales: {
        ...b.umbrales,
        recuperacion_hasta: b.umbrales.recuperacion_hasta === 0 ? 0 : (b.umbrales.recuperacion_hasta ?? 1),
        reprueba_desde_areas:
          b.unidad === 'AMBAS' && b.umbrales.reprueba_desde_areas !== null ? (b.umbrales.reprueba_desde_areas ?? 1) : null,
      },
    };
    try {
      await actualizar.mutateAsync(saneado);
      setConfirmar(false);
      setMensaje({ tone: 'success', texto: 'Política guardada. La recuperación de fin de año quedó alineada.' });
    } catch (err) {
      setConfirmar(false);
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-4">
      {!puedeEditar && <Alert tone="info">Esta es la política de promoción del colegio (su SIEE). Solo el administrador puede cambiarla y no en un año cerrado.</Alert>}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      <Tabs
        items={[
          { key: 'promocion', label: 'Reglas de promoción' },
          { key: 'titulo', label: 'Grado y título' },
          { key: 'texto', label: 'Texto oficial del SIEE' },
        ]}
        value={pestana}
        onChange={setPestana}
      />

      <TabPanel active={pestana} tabKey="promocion">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Responde las tres preguntas; a la derecha ves cómo queda y puedes probarlo.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setReglas(true)}>
                Reglas especiales{b.reglas.length > 0 ? ` (${b.reglas.length})` : ''}
              </Button>
              {puedeEditar && (
                <Button type="button" onClick={() => setModelo(true)}>
                  Empezar con el modelo del Decreto 1290
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              <TarjetaEvaluacion valor={b} onChange={setB} bloqueado={bloqueado} />
              <TarjetaUmbrales valor={b} onChange={setB} bloqueado={bloqueado} notaAprobatoria={notaAprobatoria} />
              <TarjetaExcepciones valor={b} onChange={setB} bloqueado={bloqueado} periodos={periodos} />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              <ResumenSIEE politica={b} notaAprobatoria={notaAprobatoria} nombres={nombres} />
              <SimuladorCaso academicYearId={academicYearId} politica={b} />
            </aside>
          </div>
        </div>
      </TabPanel>

      <TabPanel active={pestana} tabKey="titulo">
        <TarjetaTitulacion valor={b} onChange={setB} bloqueado={bloqueado} />
      </TabPanel>
      <TabPanel active={pestana} tabKey="texto">
        <TarjetaTextoSiee valor={b} onChange={setB} bloqueado={bloqueado} />
      </TabPanel>

      {puedeEditar && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
          <span className="text-sm text-muted">{sucio ? 'Tienes cambios sin guardar.' : 'No hay cambios por guardar.'}</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!sucio} onClick={() => setB(inicial)}>
              Descartar cambios
            </Button>
            <Button type="button" disabled={!sucio} onClick={() => setConfirmar(true)}>
              Guardar y revisar cambios
            </Button>
          </div>
        </div>
      )}

      <PanelModeloDecreto1290 open={modelo} onClose={() => setModelo(false)} actual={b} notaAprobatoria={notaAprobatoria} nombres={nombres} onAplicar={setB} />
      <PanelReglasEspeciales open={reglas} onClose={() => setReglas(false)} valor={b} onChange={setB} puedeEditar={puedeEditar} />
      <ConfirmarCambiosPolitica open={confirmar} onClose={() => setConfirmar(false)} onConfirmar={() => void guardar()} guardando={actualizar.isPending} antes={politica} despues={b} notaAprobatoria={notaAprobatoria} nombres={nombres} />
    </div>
  );
}
