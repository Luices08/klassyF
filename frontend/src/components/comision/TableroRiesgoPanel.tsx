import { useState } from 'react';
import { useCampuses, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useInstitution } from '../../hooks/useInstitution';
import { useGroups } from '../../hooks/useGroups';
import { type NivelRiesgo, useTableroRiesgo } from '../../hooks/useComision';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { FichaDrawer } from './FichaDrawer';

const TONO_RIESGO: Record<NivelRiesgo, Tone> = { VERDE: 'green', AMARILLO: 'orange', NARANJA: 'orange', ROJO: 'red' };
const NOMBRE_RIESGO: Record<NivelRiesgo, string> = { VERDE: 'Verde', AMARILLO: 'Amarillo', NARANJA: 'Naranja', ROJO: 'Rojo' };
// El color nunca es la única señal: el nivel siempre sale escrito.
const ORDEN: NivelRiesgo[] = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE'];

/**
 * Tablero de riesgo académico de un periodo: semáforo por estudiante y alertas de reprobación masiva por asignatura y por docente. Los umbrales son
 * los del colegio (pestaña Configuración). No decide nada: la promoción es de M19.
 */
export function TableroRiesgoPanel({ anioId, periodos }: { anioId?: string; periodos: Array<{ numero: number; nombre: string }> }) {
  const { data: institucion } = useInstitution();
  const sedes = useCampuses(institucion?._id).data ?? [];
  const jornadas = useTodasLasJornadas().data ?? [];
  const grupos = useGroups({ academic_year_id: anioId });
  const [sedeId, setSedeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [periodo, setPeriodo] = useState<number | ''>('');
  const [grupoId, setGrupoId] = useState('');
  const [nivel, setNivel] = useState<NivelRiesgo | ''>('');
  const [ficha, setFicha] = useState<{ id: string; nombre: string } | null>(null);

  const gruposFiltrados = (grupos.data ?? []).filter((g) => {
    const sId = typeof g.sede_id === 'object' ? g.sede_id._id : g.sede_id;
    const jId = typeof g.jornada_id === 'object' ? g.jornada_id._id : g.jornada_id;
    if (sedeId && sId !== sedeId) return false;
    if (jornadaId && jId !== jornadaId) return false;
    return true;
  });

  const elegido = periodo || periodos[0]?.numero;
  const tablero = useTableroRiesgo({ academic_year_id: anioId, periodo_numero: elegido || undefined, group_id: grupoId || undefined });
  const filas = (tablero.data?.estudiantes ?? []).filter((e) => !nivel || e.nivel === nivel);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Periodo" value={elegido ?? ''} onChange={(e) => setPeriodo(Number(e.target.value))}>
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <Select label="Sede" value={sedeId} onChange={(e) => { setSedeId(e.target.value); setGrupoId(''); }}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Jornada" value={jornadaId} onChange={(e) => { setJornadaId(e.target.value); setGrupoId(''); }}>
            <option value="">Todas las jornadas</option>
            {jornadas.map((j) => (
              <option key={j._id} value={j._id}>
                {j.nombre}
              </option>
            ))}
          </Select>
          <SelectBuscable label="Grupo" value={grupoId} onChange={setGrupoId} vacioLabel="Todos los grupos" placeholder="Buscar grupo…" opciones={opcionesDeGrupos(gruposFiltrados)} />
          <Select label="Nivel de riesgo" value={nivel} onChange={(e) => setNivel(e.target.value as NivelRiesgo | '')}>
            <option value="">Todos</option>
            {ORDEN.map((n) => (
              <option key={n} value={n}>
                {NOMBRE_RIESGO[n]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {tablero.isLoading && <Spinner />}
      {tablero.isError && <Alert tone="error">{errorMessage(tablero.error)}</Alert>}

      {tablero.data && (
        <>
          {tablero.data.hay_notas_provisionales && <Alert tone="warning">Hay planillas abiertas: esas notas son una proyección, no son definitivas.</Alert>}
          <div className="flex flex-wrap gap-2">
            {ORDEN.map((n) => (
              <Chip key={n} tone={TONO_RIESGO[n]}>
                {NOMBRE_RIESGO[n]}: {tablero.data.resumen[n]}
              </Chip>
            ))}
            <Chip tone="neutral">Total: {tablero.data.resumen.total}</Chip>
            <Chip tone="blue">Con PIAR: {tablero.data.resumen.con_piar}</Chip>
          </div>

          {(tablero.data.alertas_masivas.asignaturas.length > 0 || tablero.data.alertas_masivas.docentes.length > 0) && (
            <Card>
              <CardHeader title="Reprobación masiva" subtitle="Asignaturas y docentes donde el porcentaje de estudiantes que pierden supera el umbral del colegio." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ['Por asignatura y grupo', tablero.data.alertas_masivas.asignaturas],
                  ['Por docente', tablero.data.alertas_masivas.docentes],
                ].map(([titulo, lista]) => (
                  <div key={titulo as string}>
                    <p className="mb-1 text-label text-body">{titulo as string}</p>
                    <ul className="space-y-1 text-sm">
                      {(lista as typeof tablero.data.alertas_masivas.asignaturas).length === 0 && <li className="text-muted">Sin alertas.</li>}
                      {(lista as typeof tablero.data.alertas_masivas.asignaturas).map((a) => (
                        <li key={a.clave} className="flex justify-between gap-3 border-b border-border py-1">
                          <span>{a.nombre}</span>
                          <strong className="text-danger">
                            {a.reprobados}/{a.evaluados} · {a.porcentaje}%
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Grupo</Th>
              <Th>Riesgo</Th>
              <Th>Pierde</Th>
              <Th>Inasistencia</Th>
              <Th>{''}</Th>
            </TableHead>
            <TableBody>
              {filas.length === 0 && <EmptyRow colSpan={6}>No hay estudiantes con ese filtro.</EmptyRow>}
              {filas.map((e) => (
                <tr key={e.student_id}>
                  <Td>
                    {e.apellido} {e.nombre}
                    <span className="block text-xs text-muted">{e.numero_documento}</span>
                    {e.tiene_piar && <span className="text-xs text-primary">Tiene PIAR vigente</span>}
                  </Td>
                  <Td>{e.grupo}</Td>
                  <Td>
                    <Chip tone={TONO_RIESGO[e.nivel]}>{NOMBRE_RIESGO[e.nivel]}</Chip>
                    {e.motivos.length > 0 && <span className="mt-1 block text-xs text-muted">{e.motivos.join(' · ')}</span>}
                  </Td>
                  <Td>{e.perdidas.length > 0 ? e.perdidas.join(', ') : '—'}</Td>
                  <Td>{e.inasistencia_pct}%</Td>
                  <Td>
                    <Button variant="soft-edit" onClick={() => setFicha({ id: e.student_id, nombre: `${e.apellido} ${e.nombre}` })}>
                      Ficha
                    </Button>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {ficha && anioId && <FichaDrawer studentId={ficha.id} anioId={anioId} nombre={ficha.nombre} onClose={() => setFicha(null)} />}
    </div>
  );
}
