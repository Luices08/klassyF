import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import {
  type AlcanceRollover,
  type EstadoFilaRollover,
  type ModoContinuidad,
  NOMBRES_DESTINO,
  NOMBRES_ESTADO_ROLLOVER,
  NOMBRES_RESULTADO,
  type ResultadoRollover,
  useEjecutarRollover,
  useSimulacionRollover,
} from '../../hooks/usePromocion';

const TONO_ESTADO: Record<EstadoFilaRollover, Tone> = { POR_CREAR: 'green', YA_TIENE_MATRICULA: 'neutral', EN_ESPERA: 'orange', SIN_CUPO: 'red', SIN_CONFIRMAR: 'orange', NO_APLICA: 'neutral' };

const nombreDe = <T extends { _id: string; nombre: string }>(valor: string | T) => (typeof valor === 'string' ? valor : valor.nombre);

/**
 * Rematrícula de fin de año por sede, grado y grupo (M19 → M04). Se elige el alcance en cascada (Sede → Grado → Grupo de origen, o todo el
 * grado), se SIMULA —no escribe nada— y solo entonces se confirma. Confirmar reserva cupo con PRE-matrículas (sin folio) en una sola
 * transacción: la secretaría las formaliza después en «Matrículas», donde el paz y salvo del año que termina es el candado y nace el folio. Quien
 * no alcanza cupo pasa a la lista de espera; quien espera recuperaciones (M18) no se proyecta.
 */
export function RematriculaGrupoPanel({ puedeEjecutar }: { puedeEjecutar: boolean }) {
  const { data: anios = [] } = useAniosLectivos();
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const grados = useGrades('activo');

  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [modo, setModo] = useState<'' | ModoContinuidad>('');
  const [simulado, setSimulado] = useState<AlcanceRollover | null>(null);
  const [reservando, setReservando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRollover | null>(null);

  const origen = anios.find((a) => a._id === origenId);
  const destinos = anios.filter((a) => origen && a.year > origen.year && a.estado !== 'CERRADO');
  const gruposDeOrigen = useGroups({ academic_year_id: origenId || undefined, sede_id: sedeId || undefined, grade_id: gradoId || undefined });

  const alcance: AlcanceRollover = {
    origen_id: origenId || undefined,
    destino_id: destinoId || undefined,
    sede_id: sedeId || undefined,
    grade_id: gradoId || undefined,
    group_id: grupoId || undefined,
    continuidad: modo || undefined,
  };
  // Cambiar cualquier selector descarta lo simulado: lo que se confirma es siempre lo que se acaba de ver.
  const cambiar = (poner: () => void) => {
    poner();
    setSimulado(null);
    setResultado(null);
  };

  const plan = useSimulacionRollover(simulado ?? {}, simulado !== null);
  const resumen = plan.data?.resumen;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Año que termina"
            value={origenId}
            onChange={(e) =>
              cambiar(() => {
                setOrigenId(e.target.value);
                setDestinoId('');
                setGrupoId('');
              })
            }
          >
            <option value="">Elige el año</option>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.estado === 'EN_CURSO' ? 'en curso' : a.estado === 'CERRADO' ? 'cerrado' : 'en planificación'}
              </option>
            ))}
          </Select>
          <Select label="Año siguiente" value={destinoId} onChange={(e) => cambiar(() => setDestinoId(e.target.value))} disabled={!origen} hint={origen && destinos.length === 0 ? 'Crea primero el año siguiente en «Año lectivo».' : undefined}>
            <option value="">Elige el año</option>
            {destinos.map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.estado === 'EN_CURSO' ? 'en curso' : 'en planificación'}
              </option>
            ))}
          </Select>
          <Select
            label="Sede"
            value={sedeId}
            disabled={!origen}
            onChange={(e) =>
              cambiar(() => {
                setSedeId(e.target.value);
                setGrupoId('');
              })
            }
          >
            <option value="">Todas mis sedes</option>
            {(sedes.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Grado de origen"
            value={gradoId}
            disabled={!origen}
            onChange={(e) =>
              cambiar(() => {
                setGradoId(e.target.value);
                setGrupoId('');
              })
            }
          >
            <option value="">Todos los grados</option>
            {(grados.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>
          <Select label="Grupo de origen" value={grupoId} onChange={(e) => cambiar(() => setGrupoId(e.target.value))} disabled={!origen || !gradoId} hint={gradoId ? undefined : 'Elige un grado para escoger un grupo.'}>
            <option value="">{gradoId ? 'Procesar todo el grado' : 'Todos'}</option>
            {(gruposDeOrigen.data ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {nombreDe(g.grade_id)} {g.nomenclatura}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-4 max-w-md">
          <Select
            label="A quién se pre-matricula"
            value={modo}
            onChange={(e) => cambiar(() => setModo(e.target.value as typeof modo))}
            hint="Con la renovación de matrícula en uso, lo normal es solo quienes la familia confirmó (octubre)."
          >
            <option value="">Según el colegio (confirmados si usa la renovación)</option>
            <option value="CONFIRMADOS">Solo a quienes confirmaron que continúan</option>
            <option value="TODOS">A todos los que su cierre deja seguir</option>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-xs text-muted">
            Avanza por etapas: cada grupo o grado se proyecta sin esperar a los demás. Solo se pre-matricula a quien ya tiene un resultado final de promoción; quien espera
            recuperaciones (M18), comisión o notas queda fuera hasta que se resuelva.
          </p>
          <Button onClick={() => setSimulado(alcance)} disabled={!origenId || !destinoId} isLoading={plan.isFetching}>
            Simular rematrícula
          </Button>
        </div>
      </Card>

      {resultado && (
        <Alert tone="success">
          <strong>{resultado.creadas} matrícula(s) definitiva(s) asentada(s) con Libro y Folio.</strong>

        </Alert>
      )}

      {plan.isLoading && <Spinner />}
      {plan.isError && <Alert tone="error">{errorMessage(plan.error)}</Alert>}

      {plan.data && resumen && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone="green">Matrícula definitiva: {resumen.por_crear}</Chip>
              <Chip tone={resumen.sin_cupo > 0 ? 'red' : 'neutral'}>Sin cupo por aforo: {resumen.sin_cupo}</Chip>
              <Chip tone="neutral">Ya tienen matrícula: {resumen.ya_tienen_matricula}</Chip>
              {plan.data.modo_continuidad === 'CONFIRMADOS' && <Chip tone={resumen.sin_confirmar > 0 ? 'orange' : 'neutral'}>Sin confirmar: {resumen.sin_confirmar}</Chip>}

              <Chip tone="neutral">No aplican: {resumen.no_aplica}</Chip>
              {plan.data.retirados > 0 && <Chip tone="neutral">Retirados: {plan.data.retirados}</Chip>}
            </div>
            {puedeEjecutar && (
              <Button onClick={() => setReservando(true)} disabled={resumen.por_crear === 0}>
                Asentar matrículas definitivas
              </Button>
            )}
          </div>
          {plan.data.alertas.map((alerta) => (
            <Alert key={alerta} tone="warning">
              {alerta}
            </Alert>
          ))}

          {plan.data.grupos_destino.length > 0 && (
            <Table>
              <TableHead>
                <Th>Grupo destino ({plan.data.destino.year})</Th>
                <Th>Cupo</Th>
                <Th>Ya ocupados</Th>
                <Th>Esta rematrícula</Th>
                <Th>Quedan libres</Th>
              </TableHead>
              <TableBody>
                {plan.data.grupos_destino.map((g) => (
                  <tr key={g.id}>
                    <Td>{g.nombre}</Td>
                    <Td>{g.capacidad}</Td>
                    <Td>{g.ocupados_antes}</Td>
                    <Td>+{g.asignados}</Td>
                    <Td>{g.libres_despues === 0 ? <Chip tone="red">Lleno</Chip> : g.libres_despues}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}

          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Resultado</Th>
              <Th>Destino</Th>
              <Th>Grupo</Th>
              <Th>Paz y salvo</Th>
              <Th>Estado</Th>
            </TableHead>
            <TableBody>
              {plan.data.filas.length === 0 && <EmptyRow colSpan={6}>No hay estudiantes con matrícula activa en este alcance.</EmptyRow>}
              {plan.data.filas.map((f) => (
                <tr key={f.student_id}>
                  <Td>
                    {f.estudiante.apellido} {f.estudiante.nombre}
                    <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                  </Td>
                  <Td>
                    {f.resultado ? NOMBRES_RESULTADO[f.resultado] : 'Sin cierre'}
                    {f.resultado === 'PENDIENTE_RECUPERACION' && (
                      <span className="mt-1 block">
                        <Chip tone="orange">En espera de resolución en M18</Chip>
                      </span>
                    )}
                  </Td>
                  <Td>
                    {NOMBRES_DESTINO[f.destino]}
                    {f.tipo_ingreso && <span className="block text-xs text-muted">Ingresa como {f.tipo_ingreso === 'ANTIGUO' ? 'antiguo' : 'repitente'}</span>}
                  </Td>
                  <Td>
                    {f.grupo_origen}
                    {f.grupo_destino && <span className="block text-xs text-primary">→ {f.grupo_destino}</span>}
                  </Td>
                  <Td>{f.paz_y_salvo === 'CONFIRMADO' ? <Chip tone="green">Confirmado</Chip> : <Chip tone="orange">Pendiente</Chip>}</Td>
                  <Td>
                    <Chip tone={TONO_ESTADO[f.estado]}>{f.estado === 'EN_ESPERA' && f.posicion_espera ? `Espera n.º ${f.posicion_espera}` : NOMBRES_ESTADO_ROLLOVER[f.estado]}</Chip>
                    {f.motivo && <span className="mt-1 block text-xs text-muted">{f.motivo}</span>}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {reservando && simulado && plan.data && (
        <ConfirmarRematricula
          alcance={{ ...simulado, origen_id: simulado.origen_id as string, destino_id: simulado.destino_id as string }}
          cantidad={plan.data.resumen.por_crear}

          anioDestino={plan.data.destino.year}
          alcanceTexto={simulado.group_id ? 'el grupo elegido' : simulado.grade_id ? 'el grado elegido' : 'las sedes elegidas'}
          onClose={() => setReservando(false)}
          onHecho={(r) => {
            setResultado(r);
            setSimulado(null);
            setReservando(false);
          }}
        />
      )}
    </div>
  );
}

function ConfirmarRematricula({
  alcance,
  cantidad,

  anioDestino,
  alcanceTexto,
  onClose,
  onHecho,
}: {
  alcance: AlcanceRollover & { origen_id: string; destino_id: string };
  cantidad: number;

  anioDestino: number;
  alcanceTexto: string;
  onClose: () => void;
  onHecho: (r: ResultadoRollover) => void;
}) {
  const ejecutar = useEjecutarRollover();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      onHecho(await ejecutar.mutateAsync({ ...alcance, confirm_password: clave }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title={`Asentar matrículas definitivas ${anioDestino}`} onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Asentar matrículas definitivas" isSubmitting={ejecutar.isPending} submitDisabled={!clave}>
      <Alert tone="info">
        Para {alcanceTexto} se asentarán {cantidad} matrícula(s) definitivas con asignación de Libro y Folio reglamentario.
        Los estudiantes antiguos no transitan por condicional ni preinscrito, conservando sus documentos en archivo. Repetir esta acción no duplica a quien ya tiene matrícula.
      </Alert>
      <Input label="Tu contraseña" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
