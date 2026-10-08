import { useState, type ReactNode } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { descargarPdfAsistencia, useClasesAsistencia } from '../../hooks/useAsistencia';
import { useEnrollmentsList } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import type { Rol } from '../../types/api';
import type { AcademicYear } from '../../types/domain';

/** Una tarjeta de reporte: sus filtros y un solo botón que baja el PDF; el estado de la descarga es suyo. */
function TarjetaReporte({
  titulo,
  descripcion,
  deshabilitado,
  descargar,
  children,
}: {
  titulo: string;
  descripcion: string;
  deshabilitado?: boolean;
  descargar: () => Promise<void>;
  children: ReactNode;
}) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDescargar() {
    setDescargando(true);
    setError(null);
    try {
      await descargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Card>
      <CardHeader title={titulo} subtitle={descripcion} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="button" isLoading={descargando} disabled={deshabilitado} onClick={() => void handleDescargar()}>
            Descargar PDF
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SelectorPeriodo({ id, anio, value, onChange, conTodos }: { id: string; anio: AcademicYear; value: string; onChange: (valor: string) => void; conTodos?: boolean }) {
  return (
    <Select id={id} label="Periodo" value={value} onChange={(e) => onChange(e.target.value)}>
      {conTodos && <option value="">Todos los periodos</option>}
      {anio.periodos.map((p) => (
        <option key={p.numero} value={p.numero}>
          {p.nombre}
        </option>
      ))}
    </Select>
  );
}

const etiquetaGrupo = (grado: string, grupo: string) => `${grado} ${grupo}`.trim();

/**
 * Reportes en PDF de asistencia. Cada rol ve solo los que puede sacar: el docente la planilla de sus clases y el
 * consolidado del grupo que dirige; coordinación y administración todos; secretaría la planilla y la ficha del estudiante.
 */
export function ReportesAsistenciaPanel({ anio, rol }: { anio: AcademicYear; rol: Rol }) {
  const esCoordinacion = rol === 'ADMIN' || rol === 'COORDINADOR';
  const { data: clases = [] } = useClasesAsistencia(anio._id);
  const { data: grupos = [] } = useGroups({ academic_year_id: anio._id });

  // Planilla de una clase
  const [claseKey, setClaseKey] = useState('');
  const [alcancePlanilla, setAlcancePlanilla] = useState<'mes' | 'periodo'>('periodo');
  const [mesPlanilla, setMesPlanilla] = useState(() => new Date().toISOString().slice(0, 7));
  const [periodoPlanilla, setPeriodoPlanilla] = useState(String(anio.periodos[0]?.numero ?? ''));
  const clase = clases.find((c) => `${c.group_id}|${c.subject_id}` === claseKey);

  // Consolidado de un grupo
  const [grupoConsolidado, setGrupoConsolidado] = useState('');
  const [periodoConsolidado, setPeriodoConsolidado] = useState('');
  const gruposDeClases = [...new Map(clases.map((c) => [c.group_id, c.grupo])).entries()];

  // Reporte institucional
  const [periodoInstitucional, setPeriodoInstitucional] = useState('');

  // Ficha de un estudiante
  const [grupoFicha, setGrupoFicha] = useState('');
  const [estudianteFicha, setEstudianteFicha] = useState('');
  const [periodoFicha, setPeriodoFicha] = useState('');
  const { data: matriculas } = useEnrollmentsList({ academic_year_id: anio._id, group_id: grupoFicha, limit: 100 }, Boolean(grupoFicha));
  const estudiantes = (matriculas?.data ?? []).flatMap((m) => (typeof m.student_id === 'object' ? [m.student_id] : []));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TarjetaReporte
        titulo="Planilla de asistencia"
        descripcion="La planilla clásica (estudiantes en filas, días en columnas) lista para imprimir y firmar."
        deshabilitado={!clase}
        descargar={() =>
          descargarPdfAsistencia(
            'planilla',
            {
              group_id: clase?.group_id,
              subject_id: clase?.subject_id,
              ...(alcancePlanilla === 'mes' ? { mes: mesPlanilla } : { periodo_numero: periodoPlanilla }),
            },
            `planilla-${clase?.grupo ?? ''}-${clase?.asignatura ?? ''}.pdf`
          )
        }
      >
        <div className="sm:col-span-2">
          <Select id="clase-planilla" label="Clase" value={claseKey} onChange={(e) => setClaseKey(e.target.value)}>
            <option value="">Selecciona una clase…</option>
            {clases.map((c) => (
              <option key={`${c.group_id}|${c.subject_id}`} value={`${c.group_id}|${c.subject_id}`}>
                {c.grupo} · {c.asignatura} — {c.docente}
              </option>
            ))}
          </Select>
        </div>
        <Select id="alcance-planilla" label="Alcance" value={alcancePlanilla} onChange={(e) => setAlcancePlanilla(e.target.value as 'mes' | 'periodo')}>
          <option value="periodo">Un periodo (una hoja por mes)</option>
          <option value="mes">Un mes</option>
        </Select>
        {alcancePlanilla === 'mes' ? (
          <Input id="mes-planilla" label="Mes" type="month" value={mesPlanilla} onChange={(e) => setMesPlanilla(e.target.value)} />
        ) : (
          <SelectorPeriodo id="periodo-planilla" anio={anio} value={periodoPlanilla} onChange={setPeriodoPlanilla} />
        )}
      </TarjetaReporte>

      {(esCoordinacion || rol === 'DOCENTE') && (
        <TarjetaReporte
          titulo="Consolidado de un grupo"
          descripcion="Fallas por asignatura y totales de cada estudiante del grupo. Lo saca coordinación o el director del grupo."
          deshabilitado={!grupoConsolidado}
          descargar={() => descargarPdfAsistencia('consolidado-grupo', { group_id: grupoConsolidado, periodo_numero: periodoConsolidado }, 'consolidado-grupo.pdf')}
        >
          <Select id="grupo-consolidado" label="Grupo" value={grupoConsolidado} onChange={(e) => setGrupoConsolidado(e.target.value)}>
            <option value="">Selecciona un grupo…</option>
            {esCoordinacion
              ? grupos.map((g) => (
                  <option key={g._id} value={g._id}>
                    {etiquetaGrupo(typeof g.grade_id === 'object' ? g.grade_id.nombre : '', g.nomenclatura)}
                  </option>
                ))
              : gruposDeClases.map(([id, etiqueta]) => (
                  <option key={id} value={id}>
                    {etiqueta}
                  </option>
                ))}
          </Select>
          <SelectorPeriodo id="periodo-consolidado" anio={anio} value={periodoConsolidado} onChange={setPeriodoConsolidado} conTodos />
        </TarjetaReporte>
      )}

      {esCoordinacion && (
        <TarjetaReporte
          titulo="Reporte institucional"
          descripcion="Ausentismo de toda la institución por grado (con sus grupos), por asignatura y cruzado grado por asignatura."
          descargar={() => descargarPdfAsistencia('reporte', { academic_year_id: anio._id, periodo_numero: periodoInstitucional }, 'reporte-asistencia.pdf')}
        >
          <SelectorPeriodo id="periodo-institucional" anio={anio} value={periodoInstitucional} onChange={setPeriodoInstitucional} conTodos />
        </TarjetaReporte>
      )}

      {(esCoordinacion || rol === 'SECRETARIA') && (
        <TarjetaReporte
          titulo="Ficha de un estudiante"
          descripcion="Historial de inasistencias del estudiante con su asignatura, novedad y estado de la justificación."
          deshabilitado={!estudianteFicha}
          descargar={() =>
            descargarPdfAsistencia(
              'estudiante',
              { student_id: estudianteFicha, academic_year_id: anio._id, periodo_numero: periodoFicha },
              'ficha-asistencia-estudiante.pdf'
            )
          }
        >
          <Select
            id="grupo-ficha"
            label="Grupo"
            value={grupoFicha}
            onChange={(e) => {
              setGrupoFicha(e.target.value);
              setEstudianteFicha('');
            }}
          >
            <option value="">Selecciona un grupo…</option>
            {grupos.map((g) => (
              <option key={g._id} value={g._id}>
                {etiquetaGrupo(typeof g.grade_id === 'object' ? g.grade_id.nombre : '', g.nomenclatura)}
              </option>
            ))}
          </Select>
          <Select id="estudiante-ficha" label="Estudiante" value={estudianteFicha} disabled={!grupoFicha} onChange={(e) => setEstudianteFicha(e.target.value)}>
            <option value="">Selecciona un estudiante…</option>
            {estudiantes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.apellido} {s.nombre}
              </option>
            ))}
          </Select>
          <SelectorPeriodo id="periodo-ficha" anio={anio} value={periodoFicha} onChange={setPeriodoFicha} conTodos />
        </TarjetaReporte>
      )}
    </div>
  );
}
