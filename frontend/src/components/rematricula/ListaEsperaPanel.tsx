import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { type FilaListaEspera, useAsignarDesdeEspera, useDescartarDeEspera, useListaEspera } from '../../hooks/useRematricula';

/**
 * Estudiantes a quienes les corresponde cupo pero no lo obtuvieron (lista de espera de la rematrícula). Coordinación y el administrador
 * los asignan a mano cuando hay cupo —la asignación crea la misma pre-matrícula— o los descartan con un motivo.
 */
export function ListaEsperaPanel({ puedeResolver }: { puedeResolver: boolean }) {
  const { data: anios = [] } = useAniosLectivos();
  const [destinoId, setDestinoId] = useState('');
  const lista = useListaEspera(destinoId || undefined);
  const asignar = useAsignarDesdeEspera();
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [descartando, setDescartando] = useState<FilaListaEspera | null>(null);
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  async function asignarA(fila: FilaListaEspera) {
    setMensaje(null);
    try {
      const r = await asignar.mutateAsync({ id: fila._id, group_id: elegidos[fila._id] as string });
      setMensaje({ tone: 'success', texto: `${fila.estudiante.apellido} ${fila.estudiante.nombre} quedó pre-matriculado en ${r.grupo}.` });
    } catch (error) {
      setMensaje({ tone: 'error', texto: errorMessage(error) });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="max-w-sm">
          <Select label="Año siguiente" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Elige el año</option>
            {anios
              .filter((a) => a.estado !== 'CERRADO')
              .map((a) => (
                <option key={a._id} value={a._id}>
                  {a.year}
                </option>
              ))}
          </Select>
        </div>
      </Card>

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}

      {destinoId && lista.data && (
        <Table>
          <TableHead>
            <Th>N.º</Th>
            <Th>Estudiante</Th>
            <Th>Grado que le corresponde</Th>
            <Th>Viene de</Th>
            <Th>Asignación</Th>
          </TableHead>
          <TableBody>
            {lista.data.length === 0 && <EmptyRow colSpan={5}>No hay estudiantes en lista de espera.</EmptyRow>}
            {lista.data.map((f) => (
              <tr key={f._id}>
                <Td>{f.posicion}</Td>
                <Td>
                  {f.estudiante.apellido} {f.estudiante.nombre}
                  <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                </Td>
                <Td>
                  {f.grado_destino}
                  <span className="block text-xs text-muted">Ingresa como {f.tipo_ingreso === 'ANTIGUO' ? 'antiguo' : 'repitente'}</span>
                </Td>
                <Td>{f.grupo_origen}</Td>
                <Td>
                  {!puedeResolver && <Chip tone="orange">En espera</Chip>}
                  {puedeResolver && f.grupos_con_cupo.length === 0 && <span className="text-xs text-muted">Sin cupo: amplía un grupo o crea otro en «Grupos».</span>}
                  {puedeResolver && (
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      {f.grupos_con_cupo.length > 0 && (
                        <>
                          <Select
                            label={`Grupo para ${f.estudiante.apellido}`}
                            hideLabel
                            value={elegidos[f._id] ?? ''}
                            onChange={(e) => setElegidos((previo) => ({ ...previo, [f._id]: e.target.value }))}
                          >
                            <option value="">Elige un grupo</option>
                            {f.grupos_con_cupo.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.nombre} · {g.libres} libre(s)
                              </option>
                            ))}
                          </Select>
                          <Button type="button" onClick={() => void asignarA(f)} disabled={!elegidos[f._id]} isLoading={asignar.isPending}>
                            Asignar
                          </Button>
                        </>
                      )}
                      <Button type="button" variant="soft-danger" onClick={() => setDescartando(f)}>
                        Descartar
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      {descartando && <DescartarDrawer fila={descartando} onClose={() => setDescartando(null)} />}
    </div>
  );
}

function DescartarDrawer({ fila, onClose }: { fila: FilaListaEspera; onClose: () => void }) {
  const descartar = useDescartarDeEspera();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await descartar.mutateAsync({ id: fila._id, motivo: motivo.trim() });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title="Descartar de la lista de espera" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Descartar" submitVariant="soft-danger" isSubmitting={descartar.isPending} submitDisabled={motivo.trim().length < 10}>
      <Alert tone="info">
        {fila.estudiante.apellido} {fila.estudiante.nombre} sale de la lista de espera y no recibe cupo. El motivo queda registrado.
      </Alert>
      <Textarea label="Motivo (mínimo 10 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
