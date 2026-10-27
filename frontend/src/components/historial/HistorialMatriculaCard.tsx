import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoMatriculaBadge } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { LineaTiempo } from '../ui/LineaTiempo';
import { Spinner } from '../ui/Spinner';
import { Tabs } from '../ui/Tabs';
import { useHistorialMatricula } from '../../hooks/useHistorial';
import { formatoFechaCalendario, formatoFechaHora } from '../../lib/fechas';
import { nombreDeUsuario, tonoDeAccion } from '../../lib/historial';

type Pestana = 'acciones' | 'matriculas';

/**
 * M31 en el expediente de la matrícula: lo que se hizo sobre ella (y sobre lo que nació de ella: la admisión, sus documentos,
 * el traslado, la salida y los certificados) y las demás matrículas del estudiante, para ver su recorrido por el colegio.
 */
export function HistorialMatriculaCard({ enrollmentId }: { enrollmentId: string }) {
  const [pestana, setPestana] = useState<Pestana>('acciones');
  const historial = useHistorialMatricula(enrollmentId);
  const datos = historial.data;

  return (
    <Card>
      <CardHeader title="Historial" subtitle="Quién hizo cada cambio y cuándo. Nada se borra: el historial es de solo lectura." />
      <Tabs
        items={[
          { key: 'acciones', label: `Acciones${datos ? ` (${datos.eventos.length})` : ''}` },
          { key: 'matriculas', label: `Otras matrículas del estudiante${datos ? ` (${datos.matriculas_del_estudiante.length})` : ''}` },
        ]}
        active={pestana}
        onChange={(key) => setPestana(key as Pestana)}
      />
      <div className="pt-4">
        {historial.isLoading && <Spinner />}
        {historial.isError && <Alert tone="error">{errorMessage(historial.error)}</Alert>}
        {datos && pestana === 'acciones' && (
          <LineaTiempo
            vacio="Todavía no hay acciones registradas sobre esta matrícula."
            items={datos.eventos.map((ev) => ({
              key: ev._id,
              fecha: formatoFechaHora(ev.fecha),
              encabezado: <Chip tone={tonoDeAccion(ev.accion)}>{ev.etiqueta}</Chip>,
              children: (
                <>
                  <p className="text-ink">{ev.detalle ?? ev.etiqueta}</p>
                  <p className="mt-1 text-xs text-muted">
                    Por {nombreDeUsuario(ev.usuario)}
                    {ev.entidad !== 'Enrollment' && ` · ${ev.modulo_nombre}`}
                  </p>
                </>
              ),
            }))}
          />
        )}
        {datos && pestana === 'matriculas' &&
          (datos.matriculas_del_estudiante.length === 0 ? (
            <p className="text-sm text-muted">Sin matrículas anteriores: es la primera matrícula del estudiante en el colegio.</p>
          ) : (
            <ul className="divide-y divide-border">
              {datos.matriculas_del_estudiante.map((m) => (
                <li key={m._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-label text-ink">
                      {m.anio ?? 'Año sin dato'} · {m.grado ?? 'Grado sin dato'} {m.grupo ?? ''}
                    </p>
                    <p className="text-xs text-muted">
                      {m.folio_matricula ? `Folio ${m.folio_matricula}` : 'Sin folio'}
                      {m.fecha_matricula && ` · Matriculado el ${formatoFechaCalendario(m.fecha_matricula)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <EstadoMatriculaBadge value={m.estado} />
                    <Link to={`/admin/enrollments/${m._id}`} className="text-sm font-semibold text-primary hover:underline">
                      Ver
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Card>
  );
}
