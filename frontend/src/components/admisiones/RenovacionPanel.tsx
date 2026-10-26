import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useAuth } from '../../context/AuthContext';
import { useCampuses, useGrades } from '../../hooks/useCatalogs';
import { type DecisionContinuidad, type EstadoDeContinuidad, NOMBRES_CONTINUIDAD, useContinuidad, useRegistrarContinuidad } from '../../hooks/useContinuidad';
import { useInstitution } from '../../hooks/useInstitution';
import { formatoFechaCalendario } from '../../lib/fechas';

const TONO: Record<EstadoDeContinuidad, Tone> = { CONTINUA: 'green', NO_CONTINUA: 'red', SIN_RESPUESTA: 'neutral' };

/**
 * Renovación de matrícula de los antiguos (M04): en octubre la familia dice si su hijo sigue el año siguiente. Aquí la secretaría anota lo que dijo en el
 * mostrador o por teléfono; lo que la familia responde por el portal también aparece. «Continúa» aparta un cupo en el grado siguiente (sede y jornada
 * actuales) hasta que el rollover lo pre-matricula; no pide documentos ni crea matrícula.
 */
export function RenovacionPanel({ anioId }: { anioId: string | undefined }) {
  const puede = ['ADMIN', 'SECRETARIA'].includes(useAuth().user?.rol ?? '');
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const grados = useGrades('activo');

  const [sedeId, setSedeId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [decision, setDecision] = useState<'' | EstadoDeContinuidad>('');
  const [buscar, setBuscar] = useState('');

  const lista = useContinuidad(anioId, { sede_id: sedeId || undefined, grade_id: gradoId || undefined, decision: decision || undefined });
  const registrar = useRegistrarContinuidad(anioId);

  if (!anioId) return <Alert tone="warning">Aún no hay un año lectivo al que renovar. Créalo en «Año lectivo».</Alert>;

  const texto = buscar.trim().toLowerCase();
  const filas = (lista.data?.filas ?? []).filter(
    (f) => !texto || `${f.estudiante.apellido} ${f.estudiante.nombre} ${f.estudiante.numero_documento}`.toLowerCase().includes(texto)
  );
  const r = lista.data?.resumen;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={lista.data ? `Renovación de matrícula ${lista.data.destino.year}` : 'Renovación de matrícula'}
          subtitle={`Quién continúa el año siguiente, según la respuesta de la familia. «Continúa» aparta un cupo en el grado siguiente; quien no responde queda fuera de la rematrícula, salvo que se elija incluir a todos.`}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">Todas</option>
            {(sedes.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Grado actual" value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
            <option value="">Todos</option>
            {(grados.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
          <Input label="Buscar" placeholder="Nombre o documento" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        {r && (
          <div className="mt-4">
            <FiltrosRapidos
              ariaLabel="Respuesta de la familia"
              valor={decision}
              onChange={(c) => setDecision(c as typeof decision)}
              items={[
                { clave: '', etiqueta: 'Todos', cantidad: r.total },
                { clave: 'CONTINUA', etiqueta: 'Continúan', cantidad: r.continuan },
                { clave: 'NO_CONTINUA', etiqueta: 'No continúan', cantidad: r.no_continuan },
                { clave: 'SIN_RESPUESTA', etiqueta: 'Sin respuesta', cantidad: r.sin_respuesta },
              ]}
            />
          </div>
        )}
      </Card>

      {!puede && <Alert tone="info">Coordinación solo consulta: la renovación la registran el administrador y la secretaría.</Alert>}
      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}

      {lista.data && (
        <Table>
          <TableHead>
            <Th>Estudiante</Th>
            <Th>Grupo actual</Th>
            <Th>Pasaría a</Th>
            <Th>Respuesta</Th>
            {puede && <Th>Registrar</Th>}
          </TableHead>
          <TableBody>
            {filas.length === 0 && <EmptyRow colSpan={puede ? 5 : 4}>No hay estudiantes con matrícula activa en este alcance.</EmptyRow>}
            {filas.map((f) => {
              const responder = (d: DecisionContinuidad | null) => registrar.mutate({ studentId: f.student_id, decision: d });
              return (
                <tr key={f.student_id}>
                  <Td>
                    {f.estudiante.apellido} {f.estudiante.nombre}
                    <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                  </Td>
                  <Td>{f.grupo.nombre}</Td>
                  <Td>{f.grado_proyectado ?? <span className="text-xs text-muted">Último grado</span>}</Td>
                  <Td>
                    <Chip tone={TONO[f.decision]}>{NOMBRES_CONTINUIDAD[f.decision]}</Chip>
                    {f.decision !== 'SIN_RESPUESTA' && (
                      <span className="mt-1 block text-xs text-muted">
                        {f.canal === 'PORTAL' ? 'La familia, por el portal' : 'Registrado en secretaría'}
                        {f.fecha ? ` · ${formatoFechaCalendario(f.fecha)}` : ''}
                      </span>
                    )}
                    {f.ya_matriculado && <span className="mt-1 block text-xs text-muted">Ya tiene matrícula en {lista.data.destino.year}</span>}
                  </Td>
                  {puede && (
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={f.decision === 'CONTINUA' ? 'soft-success' : 'secondary'}
                          className="px-3 py-1"
                          disabled={registrar.isPending || f.ya_matriculado || f.decision === 'CONTINUA' || !f.grado_proyectado}
                          title={f.grado_proyectado ? undefined : 'Cursa el último grado: lo que sigue es su titulación.'}
                          onClick={() => responder('CONTINUA')}
                        >
                          Continúa
                        </Button>
                        <Button
                          variant={f.decision === 'NO_CONTINUA' ? 'soft-danger' : 'secondary'}
                          className="px-3 py-1"
                          disabled={registrar.isPending || f.ya_matriculado || f.decision === 'NO_CONTINUA'}
                          onClick={() => responder('NO_CONTINUA')}
                        >
                          No continúa
                        </Button>
                        {f.decision !== 'SIN_RESPUESTA' && !f.ya_matriculado && (
                          <Button variant="secondary" className="px-3 py-1" disabled={registrar.isPending} onClick={() => responder(null)}>
                            Quitar
                          </Button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
