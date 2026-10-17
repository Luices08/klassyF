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
import {
  type EstadoFilaRollover,
  NOMBRES_DESTINO,
  NOMBRES_ESTADO_ROLLOVER,
  NOMBRES_RESULTADO,
  type ResultadoRollover,
  useEjecutarRollover,
  useSimulacionRollover,
} from '../../hooks/usePromocion';

const TONO_ESTADO: Record<EstadoFilaRollover, Tone> = { POR_CREAR: 'green', YA_TIENE_MATRICULA: 'neutral', SIN_CUPO: 'red', NO_APLICA: 'orange' };

/**
 * Paso al año siguiente (M19 → M04). Reserva cupo con PRE-matrículas (sin folio) que la secretaría formaliza cuando lleguen los documentos;
 * nunca crea matrículas automáticas. El paz y salvo del año que termina es el candado de esa formalización.
 */
export function RolloverPanel({ puedeEjecutar }: { puedeEjecutar: boolean }) {
  const { data: anios = [] } = useAniosLectivos();
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [reservando, setReservando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRollover | null>(null);

  const origen = anios.find((a) => a._id === origenId);
  const destinos = anios.filter((a) => origen && a.year > origen.year && a.estado !== 'CERRADO');
  const plan = useSimulacionRollover(origenId || undefined, destinoId || undefined);
  const resumen = plan.data?.resumen;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Año que termina"
            value={origenId}
            onChange={(e) => {
              setOrigenId(e.target.value);
              setDestinoId('');
              setResultado(null);
            }}
          >
            <option value="">Elige el año</option>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.estado === 'EN_CURSO' ? 'en curso' : a.estado === 'CERRADO' ? 'cerrado' : 'en planificación'}
              </option>
            ))}
          </Select>
          <Select label="Año siguiente" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} disabled={!origen} hint={origen && destinos.length === 0 ? 'Crea primero el año siguiente en «Año lectivo».' : undefined}>
            <option value="">Elige el año</option>
            {destinos.map((a) => (
              <option key={a._id} value={a._id}>
                {a.year} · {a.estado === 'EN_CURSO' ? 'en curso' : 'en planificación'}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-3 text-xs text-muted">
          Solo se pre-matricula a quien ya tiene un resultado final de promoción. Quien espera recuperación, comisión o notas, y a quien una regla no le renueva el cupo, queda fuera.
        </p>
      </Card>

      {resultado && (
        <Alert tone={resultado.fallidas.length > 0 ? 'warning' : 'success'}>
          <strong>{resultado.creadas} pre-matrícula(s) creadas.</strong>
          {resultado.fallidas.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {resultado.fallidas.map((f) => (
                <li key={f.student_id}>
                  {f.estudiante}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {plan.isLoading && <Spinner />}
      {plan.isError && <Alert tone="error">{errorMessage(plan.error)}</Alert>}

      {plan.data && resumen && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone="green">Se pre-matricularán: {resumen.por_crear}</Chip>
              <Chip tone="neutral">Ya tienen matrícula: {resumen.ya_tienen_matricula}</Chip>
              <Chip tone={resumen.sin_cupo > 0 ? 'red' : 'neutral'}>Sin cupo: {resumen.sin_cupo}</Chip>
              <Chip tone="orange">No aplican: {resumen.no_aplica}</Chip>
              {plan.data.retirados > 0 && <Chip tone="neutral">Retirados: {plan.data.retirados}</Chip>}
            </div>
            {puedeEjecutar && (
              <Button onClick={() => setReservando(true)} disabled={resumen.por_crear === 0}>
                Reservar cupos
              </Button>
            )}
          </div>
          {resumen.sin_cupo > 0 && <Alert tone="warning">{resumen.sin_cupo} estudiante(s) no tienen cupo en los grupos de su sede: amplía los cupos o crea grupos en el año siguiente.</Alert>}
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
              {plan.data.filas.length === 0 && <EmptyRow colSpan={6}>No hay estudiantes con matrícula activa en el año que termina.</EmptyRow>}
              {plan.data.filas.map((f) => (
                <tr key={f.student_id}>
                  <Td>
                    {f.estudiante.apellido} {f.estudiante.nombre}
                    <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                  </Td>
                  <Td>{f.resultado ? NOMBRES_RESULTADO[f.resultado] : 'Sin cierre'}</Td>
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
                    <Chip tone={TONO_ESTADO[f.estado]}>{NOMBRES_ESTADO_ROLLOVER[f.estado]}</Chip>
                    {f.motivo && <span className="mt-1 block text-xs text-muted">{f.motivo}</span>}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {reservando && origenId && destinoId && plan.data && (
        <ConfirmarRollover
          origenId={origenId}
          destinoId={destinoId}
          cantidad={plan.data.resumen.por_crear}
          anioDestino={plan.data.destino.year}
          onClose={() => setReservando(false)}
          onHecho={(r) => {
            setResultado(r);
            setReservando(false);
          }}
        />
      )}
    </div>
  );
}

function ConfirmarRollover({
  origenId,
  destinoId,
  cantidad,
  anioDestino,
  onClose,
  onHecho,
}: {
  origenId: string;
  destinoId: string;
  cantidad: number;
  anioDestino: number;
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
      onHecho(await ejecutar.mutateAsync({ origen_id: origenId, destino_id: destinoId, confirm_password: clave }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title={`Reservar cupos ${anioDestino}`} onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Crear pre-matrículas" isSubmitting={ejecutar.isPending} submitDisabled={!clave}>
      <Alert tone="info">
        Se crearán {cantidad} pre-matrícula(s) sin folio. La secretaría las formaliza desde «Matrículas» cuando lleguen los documentos. Repetir esta acción no duplica a quien ya tiene matrícula.
      </Alert>
      <Input label="Tu contraseña de administrador" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
