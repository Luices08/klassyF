import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PanelInsumos } from '../../components/horarios/PanelInsumos';
import { PanelTiempoLibre } from '../../components/horarios/PanelTiempoLibre';
import { PanelVariables } from '../../components/horarios/PanelVariables';
import { PanelVersiones } from '../../components/horarios/PanelVersiones';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useEspacios } from '../../hooks/useEspacios';
import { useInsumosHorario, useVariablesHorario } from '../../hooks/useHorarios';
import { useInstitution } from '../../hooks/useInstitution';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

const PESTANAS = [
  { key: 'insumos', label: 'Insumos' },
  { key: 'variables', label: 'Variables' },
  { key: 'tiempo-libre', label: 'Tiempo libre' },
  { key: 'versiones', label: 'Generar y publicar' },
];

/**
 * M09 — Horarios. Todo se trabaja por año lectivo + jornada (sede): la estructura de tiempo es la de la jornada (M01),
 * la carga sale de M08 y los grados del alcance, del catálogo activo de la institución.
 */
export function HorariosPage() {
  const institutionQuery = useInstitution();
  const sedes = useCampuses(institutionQuery.data?._id).data ?? [];
  const { anio: anioDeTrabajo, anios } = useAnioDeTrabajo();
  const grados = useGrades('activo').data ?? [];

  // Otros módulos (la ficha de un grupo) llegan con ?anio=&sede=&jornada=&pestana= ya elegidos; sin ellos, todo igual que siempre.
  const [parametros] = useSearchParams();
  const [anioId, setAnioId] = useState(parametros.get('anio') ?? '');
  const [sedeId, setSedeId] = useState(parametros.get('sede') ?? '');
  const [jornadaId, setJornadaId] = useState(parametros.get('jornada') ?? '');
  const pestanaDeEntrada = PESTANAS.find((p) => p.key === parametros.get('pestana'))?.key;
  const [pestana, setPestana] = useState(pestanaDeEntrada ?? 'insumos');

  const anio = anios.find((a) => a._id === anioId) ?? anioDeTrabajo;
  const sede = sedes.find((s) => s._id === sedeId) ?? sedes.find((s) => s.es_principal) ?? sedes[0];
  const jornadas = useJornadas(sede?._id).data ?? [];
  const jornada = jornadas.find((j) => j._id === jornadaId) ?? jornadas[0];
  const contexto = { academic_year_id: anio?._id ?? '', jornada_id: jornada?._id ?? '' };

  const insumosQuery = useInsumosHorario(contexto);
  const variablesQuery = useVariablesHorario(contexto);
  const espacios = useEspacios({ sede_id: sede?._id }, Boolean(sede)).data ?? [];
  const insumos = insumosQuery.data;
  const listo = Boolean(anio && jornada);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Horarios"
        subtitle="Define las reglas, genera el horario de la jornada y publícalo. Las horas y los docentes salen de Carga académica."
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Año lectivo" value={anio?._id ?? ''} onChange={(e) => setAnioId(e.target.value)}>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Sede"
            value={sede?._id ?? ''}
            onChange={(e) => {
              setSedeId(e.target.value);
              setJornadaId('');
            }}
          >
            {sedes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Jornada" value={jornada?._id ?? ''} onChange={(e) => setJornadaId(e.target.value)}>
            {jornadas.length === 0 && <option value="">Sin jornadas</option>}
            {jornadas.map((j) => (
              <option key={j._id} value={j._id}>
                {NOMBRES_JORNADA[j.nombre] ?? j.nombre} ({j.hora_inicio}–{j.hora_fin})
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!anio && <Alert tone="info">Aún no hay años lectivos. Créalo en Año lectivo.</Alert>}
      {anio && sede && jornadas.length === 0 && <Alert tone="info">La sede {sede.nombre} no tiene jornadas. Créalas en Sedes y jornadas.</Alert>}
      {anio?.estado === 'CERRADO' && <Alert tone="info">Este año lectivo está cerrado: su horario se puede consultar pero no modificar.</Alert>}

      {listo && (
        <>
          <Tabs items={PESTANAS} value={pestana} onChange={setPestana} />
          {(insumosQuery.isLoading || variablesQuery.isLoading) && <Spinner />}
          {insumosQuery.isError && <Alert tone="error">{errorMessage(insumosQuery.error)}</Alert>}
          {variablesQuery.isError && <Alert tone="error">{errorMessage(variablesQuery.error)}</Alert>}

          {insumos && variablesQuery.data && (
            <>
              <TabPanel active={pestana} tabKey="insumos">
                <PanelInsumos insumos={insumos} />
              </TabPanel>
              <TabPanel active={pestana} tabKey="variables">
                <PanelVariables
                  contexto={contexto}
                  variables={variablesQuery.data}
                  grados={grados}
                  catalogo={insumos.catalogo}
                  espacios={espacios.map((e) => ({ _id: e._id, nombre: e.nombre }))}
                />
              </TabPanel>
              <TabPanel active={pestana} tabKey="tiempo-libre">
                <PanelTiempoLibre contexto={contexto} estructura={insumos.estructura} grados={grados} catalogo={insumos.catalogo} variables={variablesQuery.data} />
              </TabPanel>
              <TabPanel active={pestana} tabKey="versiones">
                <PanelVersiones contexto={contexto} puedeGenerar={insumos.total_sesiones > 0 && anio?.estado !== 'CERRADO'} />
              </TabPanel>
            </>
          )}
        </>
      )}
    </div>
  );
}
