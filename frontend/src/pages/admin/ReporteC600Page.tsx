import { useState } from 'react';
import { useFiltrosAlcance } from '../../components/reportes/FiltrosAlcance';
import { VistaC600 } from '../../components/reportes/VistaC600';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { DownloadIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useExportarC600, useReporteC600 } from '../../hooks/useReportes';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

/**
 * M30: reporte estadístico con la estructura del formulario C-600 del DANE. Se muestra aquí con los filtros elegidos y baja en Excel (una sola hoja) o en PDF desde el
 * mismo cálculo. Lo ven administración, coordinación y secretaría; lo bajan administración y secretaría (esta, de sus sedes). Validarlo con el formulario oficial vigente.
 */
export function ReporteC600Page() {
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  const filtros = useFiltrosAlcance(anio?._id);
  const { estado, cambiar, alcance } = filtros;
  const [fechaCorte, setFechaCorte] = useState('');
  const puedeBajar = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';

  const consulta = { academic_year_id: alcance.academic_year_id, sede_id: alcance.sede_id, jornada_id: alcance.jornada_id, grade_id: alcance.grade_id, fecha_corte: fechaCorte || undefined };
  const reporte = useReporteC600(consulta);
  const exportar = useExportarC600();

  const bajar = (formato: 'excel' | 'pdf') => {
    if (reporte.data) exportar.mutate({ formato, filtros: consulta, nombreArchivo: reporte.data.nombre_archivo });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Reporte estadístico DANE C-600" subtitle="Matrícula, resultados y edades por grado y sexo, con la estructura del formulario del DANE." />

      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Año escolar" value={estado.anioElegido} onChange={(e) => cambiar.setAnioId(e.target.value)}>
            {(estado.anios.data ?? []).map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Sede"
            value={estado.sedeId}
            onChange={(e) => {
              cambiar.setSedeId(e.target.value);
              cambiar.setJornadaId('');
            }}
          >
            <option value="">Todas las sedes</option>
            {(estado.sedes.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Jornada" value={estado.jornadaId} onChange={(e) => cambiar.setJornadaId(e.target.value)}>
            <option value="">Todas las jornadas</option>
            {estado.jornadasDeLaSede.map((j) => (
              <option key={j._id} value={j._id}>
                {NOMBRES_JORNADA[j.nombre] ?? j.nombre}
                {!estado.sedeId && typeof j.sede_id === 'object' ? ` · ${j.sede_id.nombre}` : ''}
              </option>
            ))}
          </Select>
          <Select label="Grado" value={estado.gradoId} onChange={(e) => cambiar.setGradoId(e.target.value)}>
            <option value="">Todos los grados</option>
            {(estado.grados.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
          <Input
            label="Edades cumplidas al"
            type="date"
            value={fechaCorte || reporte.data?.fecha_corte_edad || ''}
            onChange={(e) => setFechaCorte(e.target.value)}
            hint="Por defecto, el día en que empezó el periodo 1."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="soft-success" disabled={!puedeBajar || !reporte.data} isLoading={exportar.isPending && exportar.variables?.formato === 'excel'} onClick={() => bajar('excel')} title={puedeBajar ? undefined : 'Solo administración y secretaría descargan este reporte.'}>
            <DownloadIcon className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="soft-danger" disabled={!puedeBajar || !reporte.data} isLoading={exportar.isPending && exportar.variables?.formato === 'pdf'} onClick={() => bajar('pdf')} title={puedeBajar ? undefined : 'Solo administración y secretaría descargan este reporte.'}>
            <DownloadIcon className="h-4 w-4" />
            PDF
          </Button>
          {!puedeBajar && <span className="text-xs text-muted">Coordinación puede revisarlo; lo descargan administración y secretaría.</span>}
        </div>
        {exportar.isError && <Alert tone="error">{errorMessage(exportar.error)}</Alert>}
      </Card>

      {reporte.isLoading && <Spinner />}
      {reporte.isError && <Alert tone="error">{errorMessage(reporte.error)}</Alert>}
      {reporte.data && <VistaC600 r={reporte.data} />}
    </div>
  );
}
