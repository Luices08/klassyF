import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { useDescargarInformeFinal, useEstablecerPublicacionInformeFinal, usePublicacionInformeFinal } from '../../hooks/useReportes';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Switch } from '../ui/Switch';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

/**
 * Informe final del año: un documento aparte del boletín del último periodo, con las notas de todos los periodos, el año, la recuperación final,
 * las inasistencias y el estado de promoción. El personal lo baja siempre (si aún no hay cierre sale marcado como preliminar); la familia solo
 * lo ve cuando el administrador lo publica, y esa decisión es independiente de la publicación de los boletines.
 */
export function InformeFinalPanel({ anioPorDefecto }: { anioPorDefecto?: string }) {
  const { user } = useAuth();
  const anios = useAniosLectivos();
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const jornadas = useTodasLasJornadas();
  const grados = useGrades();

  const [anioId, setAnioId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const anioElegido = anioId || anioPorDefecto || '';
  useEffect(() => {
    // Cambiar el año, la sede, la jornada o el grado deja sin efecto el grupo elegido antes.
    setGrupoId('');
  }, [anioElegido, sedeId, jornadaId, gradoId]);

  const grupos = useGroups({ academic_year_id: anioElegido || undefined, sede_id: sedeId || undefined, jornada_id: jornadaId || undefined, grade_id: gradoId || undefined });
  const jornadasDeLaSede = useMemo(
    () => (jornadas.data ?? []).filter((j) => !sedeId || (typeof j.sede_id === 'object' ? j.sede_id._id : j.sede_id) === sedeId),
    [jornadas.data, sedeId]
  );
  const grupo = (grupos.data ?? []).find((g) => g._id === grupoId);
  const anio = (anios.data ?? []).find((a) => a._id === anioElegido);

  const descargar = useDescargarInformeFinal();
  const publicacion = usePublicacionInformeFinal({ academic_year_id: anioElegido, group_id: grupoId });
  const publicar = useEstablecerPublicacionInformeFinal();
  const esAdmin = user?.rol === 'ADMIN';
  const etiquetaGrupo = grupo ? `${typeof grupo.grade_id === 'object' ? grupo.grade_id.numero : ''}-${grupo.nomenclatura}` : 'grupo';

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Año lectivo" value={anioElegido} onChange={(e) => setAnioId(e.target.value)}>
            {(anios.data ?? []).map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Sede"
            value={sedeId}
            onChange={(e) => {
              setSedeId(e.target.value);
              setJornadaId('');
            }}
          >
            <option value="">Todas las sedes</option>
            {(sedes.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Jornada" value={jornadaId} onChange={(e) => setJornadaId(e.target.value)}>
            <option value="">Todas las jornadas</option>
            {jornadasDeLaSede.map((j) => (
              <option key={j._id} value={j._id}>
                {NOMBRES_JORNADA[j.nombre] ?? j.nombre}
                {!sedeId && typeof j.sede_id === 'object' ? ` · ${j.sede_id.nombre}` : ''}
              </option>
            ))}
          </Select>
          <Select label="Grado" value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
            <option value="">Todos los grados</option>
            {(grados.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
          <SelectBuscable label="Grupo" value={grupoId} onChange={setGrupoId} placeholder="Buscar grupo…" vacioLabel="Elige un grupo" opciones={opcionesDeGrupos(grupos.data ?? [])} />
        </div>
        <p className="mt-3 text-xs text-muted">
          El informe se arma por grupo, con un estudiante por hoja. Se calcula al descargarlo: antes de las recuperaciones sale marcado como preliminar y, cuando el colegio ya hizo el cierre de promoción, sale definitivo.
        </p>
        <div className="mt-4">
          <Button
            onClick={() => descargar.mutate({ referencia: { academic_year_id: anioElegido, group_id: grupoId }, nombreArchivo: `informe-final-${anio?.year ?? ''}-${etiquetaGrupo}` })}
            disabled={!anioElegido || !grupoId || descargar.isPending}
          >
            Descargar informe final (PDF)
          </Button>
        </div>
      </Card>
      {descargar.isError && <Alert tone="error">{errorMessage(descargar.error)}</Alert>}
      {descargar.isPending && <Alert tone="info">Preparando el informe…</Alert>}

      {grupoId && (
        <Card>
          <CardHeader title="Publicación para las familias" subtitle="Es independiente de la publicación de los boletines de cada periodo." />
          {publicacion.isLoading ? (
            <p className="text-sm text-muted">Consultando…</p>
          ) : (
            <Switch
              label="Informe final visible para estudiantes y acudientes"
              description={
                publicacion.data?.publicado
                  ? 'Publicado: cada estudiante y su acudiente pueden descargar su informe desde «Boletín».'
                  : 'Sin publicar: solo el personal del colegio lo puede descargar.'
              }
              checked={publicacion.data?.publicado ?? false}
              onChange={(publicado) => publicar.mutate({ academic_year_id: anioElegido, group_id: grupoId, publicado })}
              disabled={!esAdmin || publicar.isPending}
              disabledReason={!esAdmin ? 'Solo el administrador publica el informe final.' : null}
            />
          )}
          {publicar.isError && <Alert tone="error">{errorMessage(publicar.error)}</Alert>}
        </Card>
      )}
    </div>
  );
}
