import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, TipoActividadChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CalendarioCalor, type CeldaCalor } from '../ui/CalendarioCalor';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { type NivelCarga, useCargaDelGrupo } from '../../hooks/useActividades';
import { formatoInstante, hoyColombia } from '../../lib/actividades';

interface PanelCargaGrupoProps {
  onClose: () => void;
  teacherAssignmentId: string;
  /** Otras clases del docente con esta materia: se puede mirar la carga de cualquiera de esos grupos. */
  otrasClases: Array<{ id: string; etiqueta: string }>;
  /** Actividad que se está editando: no cuenta como carga de sí misma. */
  excluirId?: string;
  /** AAAA-MM con el que abre (el mes de la fecha de entrega que ya se eligió, o el actual). */
  mesInicial: string;
  /** YYYY-MM-DD de la fecha de entrega actual, para resaltarla. */
  fechaActual: string | null;
  onElegirDia: (fecha: string) => void;
}

const NIVELES: Record<NivelCarga, { tono: CeldaCalor['tono']; titulo: string; leyenda: string }> = {
  BAJA: { tono: 'green', titulo: 'Carga baja', leyenda: '0–1 actividades · día óptimo' },
  MODERADA: { tono: 'orange', titulo: 'Carga moderada', leyenda: '2 actividades' },
  ALTA: { tono: 'red', titulo: 'Sobrecarga', leyenda: '3 o más · día saturado' },
};

const FORMATO_DIA_LARGO = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Panel con el mapa de calor mensual de lo que el grupo ya tiene por entregar (de todos sus docentes), para que el docente elija bien la fecha
 * sin salir del formulario de la actividad: se abre encima y lo diligenciado no se toca. Pasar el cursor o elegir un día muestra su detalle.
 */
export function PanelCargaGrupo({ onClose, teacherAssignmentId, otrasClases, excluirId, mesInicial, fechaActual, onElegirDia }: PanelCargaGrupoProps) {
  const [mes, setMes] = useState(mesInicial);
  const [asignacionVista, setAsignacionVista] = useState(teacherAssignmentId);
  const [elegido, setElegido] = useState<string | null>(fechaActual);
  const [enfocado, setEnfocado] = useState<string | null>(null);
  const carga = useCargaDelGrupo(asignacionVista, mes, excluirId);

  const porDia = new Map((carga.data?.dias ?? []).map((d) => [d.fecha, d]));
  const celdas: Record<string, CeldaCalor> = {};
  for (const d of carga.data?.dias ?? []) {
    celdas[d.fecha] = {
      tono: NIVELES[d.nivel].tono,
      texto: String(d.total),
      descripcion: `${d.total} ${d.total === 1 ? 'actividad' : 'actividades'}, ${NIVELES[d.nivel].titulo.toLowerCase()}`,
    };
  }

  const diaVisto = enfocado ?? elegido;
  const detalle = diaVisto ? porDia.get(diaVisto) : undefined;
  const nivelVisto: NivelCarga = detalle?.nivel ?? 'BAJA';
  const opcionesGrupo = [{ id: teacherAssignmentId, etiqueta: 'Este grupo' }, ...otrasClases];

  return (
    <Drawer open onClose={onClose} title="Carga de tareas del grupo" subtitle={carga.data ? `Grupo ${carga.data.grupo.nomenclatura}` : undefined} size="lg">
      {opcionesGrupo.length > 1 && (
        <Select
          label="Grupo"
          value={asignacionVista}
          onChange={(e) => {
            setAsignacionVista(e.target.value);
            setElegido(null);
          }}
        >
          {opcionesGrupo.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Leyenda de colores">
        {(Object.keys(NIVELES) as NivelCarga[]).map((n) => (
          <Chip key={n} tone={NIVELES[n].tono}>
            {NIVELES[n].titulo}: {NIVELES[n].leyenda}
          </Chip>
        ))}
      </div>

      {carga.isError && <Alert tone="error">{errorMessage(carga.error)}</Alert>}

      <div className={carga.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <CalendarioCalor
          mes={mes}
          onCambiarMes={setMes}
          celdas={celdas}
          apagados={new Set(carga.data?.no_lectivos ?? [])}
          diasHabiles={carga.data?.dias_habiles}
          seleccionado={elegido}
          hoy={hoyColombia()}
          onSeleccionar={setElegido}
          onEnfocar={setEnfocado}
        />
      </div>
      {carga.isLoading && (
        <div className="flex justify-center">
          <Spinner label="Cargando la carga del grupo..." />
        </div>
      )}
      <p className="text-xs text-muted">Los días en gris no tienen clases (fin de semana, receso o vacaciones). Cuentan todas las asignaturas del grupo.</p>

      <div className="rounded-xl border border-border p-4">
        {!diaVisto ? (
          <p className="text-sm text-muted">Pasa el cursor o toca un día para ver qué tiene el grupo.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold capitalize text-ink">{FORMATO_DIA_LARGO.format(new Date(`${diaVisto}T00:00:00Z`))}</p>
              <Chip tone={NIVELES[nivelVisto].tono}>{NIVELES[nivelVisto].titulo}</Chip>
            </div>
            {!detalle ? (
              <p className="text-sm text-muted">El grupo no tiene entregas ni evaluaciones ese día.</p>
            ) : (
              <ul className="divide-y divide-border">
                {detalle.actividades.map((a) => (
                  <li key={a._id} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{a.titulo}</span>
                      <TipoActividadChip value={a.tipo} />
                    </div>
                    <p className="text-xs text-muted">
                      {a.asignatura} · {a.docente} · {formatoInstante(a.fecha_entrega)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {elegido && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                {porDia.get(elegido)?.nivel === 'ALTA' ? (
                  <p className="text-xs font-medium text-danger">Ese día el grupo ya está saturado: conviene otro.</p>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onElegirDia(elegido);
                    onClose();
                  }}
                >
                  Usar este día como fecha de entrega
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
