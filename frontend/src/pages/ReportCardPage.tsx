import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { FileTextIcon, SearchIcon, SlidersIcon } from '../components/ui/icons';
import { Spinner } from '../components/ui/Spinner';
import { VistaPreviaPdf } from '../components/ui/VistaPreviaPdf';
import { ReportCardView } from '../components/reportCard/ReportCardView';
import { useAuth } from '../context/AuthContext';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useGroups } from '../hooks/useGroups';
import {
  cargarPdfBoletin,
  descargarPdfBoletin,
  descargarPdfBoletinesGrupo,
  useReportCard,
  type ReportCardQuery,
} from '../hooks/useReportCard';
import { useUsers } from '../hooks/useUsers';
import { SelectBuscable } from '../components/ui/SelectBuscable';
import { opcionesDeGrupos, opcionesDePersonas } from '../lib/opcionesBuscables';

const STAFF_ROLES = ['ADMIN', 'COORDINADOR', 'SECRETARIA', 'DOCENTE'] as const;

export function ReportCardPage() {
  const { user } = useAuth();
  const { anio: anioPorDefecto, anios } = useAnioDeTrabajo();
  const isStudent = user?.rol === 'ESTUDIANTE';
  const canBrowseStudents = user ? (STAFF_ROLES as readonly string[]).includes(user.rol) : false;

  const [studentId, setStudentId] = useState(isStudent ? (user?.id ?? '') : '');
  const [anioElegidoId, setAnioElegidoId] = useState('');
  const academicYearId = anioElegidoId || anioPorDefecto?._id || '';
  // Los periodos son los que definió el colegio para ese año (no siempre son 4).
  const periodos = anios.find((a) => a._id === academicYearId)?.periodos ?? [];
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const periodo = periodos.some((p) => p.numero === periodoElegido) ? (periodoElegido as number) : (periodos[0]?.numero ?? 1);
  const [query, setQuery] = useState<ReportCardQuery | null>(null);
  const [grupoId, setGrupoId] = useState('');
  const [descargando, setDescargando] = useState<'boletin' | 'grupo' | null>(null);
  const [verVistaPrevia, setVerVistaPrevia] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  const studentsQuery = useUsers({ rol: 'ESTUDIANTE' }, canBrowseStudents);
  const reportCardQuery = useReportCard(query);
  const groupsQuery = useGroups({ academic_year_id: canBrowseStudents ? academicYearId : undefined });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setVerVistaPrevia(false);
    setQuery({ student_id: studentId, academic_year_id: academicYearId, periodo });
  }

  async function bajarPdf(tipo: 'boletin' | 'grupo') {
    setErrorPdf(null);
    setDescargando(tipo);
    try {
      if (tipo === 'boletin' && query) {
        await descargarPdfBoletin(query, `boletin-periodo-${query.periodo}.pdf`);
      } else if (tipo === 'grupo') {
        await descargarPdfBoletinesGrupo({ group_id: grupoId, academic_year_id: academicYearId, periodo }, `boletines-periodo-${periodo}.pdf`);
      }
    } catch (error) {
      setErrorPdf(errorMessage(error));
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Boletín académico"
        subtitle="Consulta el boletín de un estudiante por año lectivo y periodo."
        action={
          (user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR') ? (
            <Link to="/admin/boletin">
              <Button type="button" variant="outline">
                <SlidersIcon className="h-4 w-4" />
                Diseñar y configurar el boletín
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardHeader title="Buscar boletín" />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
          {isStudent ? (
            <Input label="Estudiante" value={studentId} disabled hint="Tu propio boletín" />
          ) : canBrowseStudents && studentsQuery.data ? (
            <SelectBuscable
              label="Estudiante"
              value={studentId}
              onChange={setStudentId}
              required
              placeholder="Buscar por nombre o documento…"
              vacioLabel="Selecciona..."
              opciones={opcionesDePersonas(studentsQuery.data)}
            />
          ) : (
            <Input
              label="ID del estudiante"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
          )}

          <Select label="Año lectivo" value={academicYearId} onChange={(e) => setAnioElegidoId(e.target.value)} required>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
                {a.estado === 'EN_CURSO' ? ' (vigente)' : a.estado === 'CERRADO' ? ' (histórico)' : ''}
              </option>
            ))}
          </Select>

          <Select label="Periodo" value={periodo} onChange={(e) => setPeriodoElegido(Number(e.target.value))}>
            {periodos.length === 0 && <option value={1}>Periodo 1</option>}
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>

          <Button type="submit" isLoading={reportCardQuery.isFetching}>
            <SearchIcon className="h-4 w-4" />
            Consultar
          </Button>
        </form>
      </Card>

      {canBrowseStudents && (
        <Card>
          <CardHeader title="Imprimir los boletines de un grupo" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
            <div className="sm:col-span-3">
              <SelectBuscable
                label="Grupo"
                value={grupoId}
                onChange={setGrupoId}
                placeholder="Buscar grupo…"
                vacioLabel="Selecciona..."
                opciones={opcionesDeGrupos(groupsQuery.data ?? [])}
              />
            </div>
            <Button type="button" variant="outline" disabled={!grupoId || !academicYearId} isLoading={descargando === 'grupo'} onClick={() => void bajarPdf('grupo')}>
              <FileTextIcon className="h-4 w-4" />
              PDF del grupo
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Un boletín por estudiante, en el periodo elegido arriba. Solo coordinación, secretaría y el director del grupo.</p>
        </Card>
      )}

      {reportCardQuery.isFetching && <Spinner label="Calculando boletín..." />}

      {reportCardQuery.isError && <Alert tone="error">{errorMessage(reportCardQuery.error)}</Alert>}
      {errorPdf && <Alert tone="error">{errorPdf}</Alert>}

      {reportCardQuery.data && (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setVerVistaPrevia((v) => !v)}>
              {verVistaPrevia ? 'Ocultar vista previa' : 'Vista previa del PDF'}
            </Button>
            <Button type="button" variant="outline" isLoading={descargando === 'boletin'} onClick={() => void bajarPdf('boletin')}>
              <FileTextIcon className="h-4 w-4" />
              Descargar PDF
            </Button>
          </div>
          {verVistaPrevia && query && (
            <VistaPreviaPdf
              claveConsulta={['boletin', query]}
              cargar={() => cargarPdfBoletin(query)}
              nombreArchivo={`boletin-periodo-${query.periodo}.pdf`}
              titulo="Vista previa del boletín"
              onCerrar={() => setVerVistaPrevia(false)}
            />
          )}
          <ReportCardView reportCard={reportCardQuery.data} />
        </>
      )}
    </div>
  );
}
