import { useEffect, useMemo, useState } from 'react';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { type FormatoSabana, useExportarSabana } from '../../hooks/useReportes';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

/**
 * Sábana de calificaciones (reporte de cierre anual). No guarda nada: cada descarga se calcula con lo que haya en ese momento, así que se puede
 * bajar al terminar un periodo o antes de las recuperaciones y volver a bajar cuando todo esté actualizado.
 */
export function SabanaPanel({ anioPorDefecto }: { anioPorDefecto?: string }) {
  const anios = useAniosLectivos();
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const jornadas = useTodasLasJornadas();
  const grados = useGrades();

  const [anioId, setAnioId] = useState('');
  const [corte, setCorte] = useState('FINAL');
  const [sedeId, setSedeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const exportar = useExportarSabana();

  const anioElegido = anioId || anioPorDefecto || '';
  useEffect(() => {
    // Cambiar el año, la sede, la jornada o el grado deja sin efecto el grupo elegido antes.
    setGrupoId('');
  }, [anioElegido, sedeId, jornadaId, gradoId]);

  const grupos = useGroups({ academic_year_id: anioElegido || undefined, sede_id: sedeId || undefined, jornada_id: jornadaId || undefined, grade_id: gradoId || undefined });
  const anio = (anios.data ?? []).find((a) => a._id === anioElegido);
  const jornadasDeLaSede = useMemo(
    () => (jornadas.data ?? []).filter((j) => !sedeId || (typeof j.sede_id === 'object' ? j.sede_id._id : j.sede_id) === sedeId),
    [jornadas.data, sedeId]
  );

  const grupoSeleccionado = (grupos.data ?? []).find((g) => g._id === grupoId);
  const etiquetaGrupo = grupoSeleccionado
    ? `${typeof grupoSeleccionado.grade_id === 'object' ? grupoSeleccionado.grade_id.numero : ''}-${grupoSeleccionado.nomenclatura}`
    : 'todos-los-grupos';
  const nombreArchivo = ['sabana', anio?.year ?? '', corte === 'FINAL' ? 'cierre-del-año' : `periodo-${corte}`, etiquetaGrupo].filter((x) => x !== '').join('-');

  const descargar = (formato: FormatoSabana) => {
    if (!anioElegido) return;
    exportar.mutate({
      formato,
      nombreArchivo,
      filtros: {
        academic_year_id: anioElegido,
        sede_id: sedeId || undefined,
        jornada_id: jornadaId || undefined,
        grade_id: gradoId || undefined,
        group_id: grupoId || undefined,
        periodo_numero: corte === 'FINAL' ? undefined : Number(corte),
      },
    });
  };

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
          <Select label="Corte" value={corte} onChange={(e) => setCorte(e.target.value)}>
            <option value="FINAL">Cierre del año</option>
            {(anio?.periodos ?? []).map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
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
          <SelectBuscable label="Grupo" value={grupoId} onChange={setGrupoId} placeholder="Buscar grupo…" vacioLabel="Todos los grupos" opciones={opcionesDeGrupos(grupos.data ?? [])} />
        </div>
        <p className="mt-3 text-xs text-muted">
          {grupoId
            ? 'Se descarga un archivo con el grupo elegido.'
            : 'Sin elegir un grupo se descarga todo lo que cubran los filtros: en Excel un solo libro con una pestaña por grupo, y en PDF una sección por grupo.'}{' '}
          El archivo se calcula al descargarlo: si lo baja antes de las recuperaciones y lo vuelve a bajar después, ya sale actualizado, y su encabezado dice en qué punto está.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => descargar('excel')} disabled={!anioElegido || exportar.isPending}>
            Exportar Sábana (Excel)
          </Button>
          <Button variant="outline" onClick={() => descargar('pdf')} disabled={!anioElegido || exportar.isPending}>
            Exportar Sábana (PDF)
          </Button>
        </div>
      </Card>
      {exportar.isError && <Alert tone="error">{errorMessage(exportar.error)}</Alert>}
      {exportar.isPending && <Alert tone="info">Preparando el archivo…</Alert>}
    </div>
  );
}
