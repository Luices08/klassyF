import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useGroups } from '../../hooks/useGroups';
import {
  type FilaPromocion,
  type MomentoPromocion,
  NOMBRES_MOMENTO_PROMOCION,
  NOMBRES_RESULTADO,
  type ResultadoPromocion,
  type ResumenCierre,
  useCerrarGrupoPromocion,
  useSimulacionPromocion,
} from '../../hooks/usePromocion';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';

export const TONO_RESULTADO: Record<ResultadoPromocion, Tone> = {
  PROMOVIDO: 'green',
  PROMOVIDO_POR_RECUPERACION: 'green',
  PROMOVIDO_CON_ARRASTRE: 'blue',
  NO_PROMOVIDO: 'red',
  PENDIENTE_RECUPERACION: 'orange',
  EN_COMISION: 'orange',
  RETIRO_PROPUESTO: 'red',
  INCOMPLETO: 'neutral',
};

/**
 * Cierre de la promoción por grupo (M19). Primero se simula (no guarda nada) y el rector confirma con su contraseña: es todo o nada para
 * el grupo, salvo quien tiene una nivelación pendiente, que queda aparte sin frenar a los demás.
 */
export function CierreGrupoPanel({ anioId, anioEstado, puedeCerrar }: { anioId?: string; anioEstado?: string; puedeCerrar: boolean }) {
  const grupos = useGroups({ academic_year_id: anioId });
  const [grupoId, setGrupoId] = useState('');
  const [momento, setMomento] = useState<MomentoPromocion>('CIERRE');
  const [cerrando, setCerrando] = useState(false);
  const [resumen, setResumen] = useState<ResumenCierre | null>(null);

  const simulacion = useSimulacionPromocion(anioId, grupoId || undefined, momento);
  const filas = simulacion.data ?? [];
  const porCerrar = filas.filter((f) => f.motor);
  const incompletos = porCerrar.filter((f) => f.motor?.resultado === 'INCOMPLETO');

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectBuscable label="Grupo" value={grupoId} onChange={setGrupoId} placeholder="Buscar grupo…" vacioLabel="Elige un grupo" opciones={opcionesDeGrupos(grupos.data ?? [])} />
          <Select label="Momento" value={momento} onChange={(e) => setMomento(e.target.value as MomentoPromocion)}>
            {(Object.keys(NOMBRES_MOMENTO_PROMOCION) as MomentoPromocion[]).map((m) => (
              <option key={m} value={m}>
                {NOMBRES_MOMENTO_PROMOCION[m]}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-3 text-xs text-muted">
          La simulación calcula con la política del colegio y no guarda nada. «Tras la recuperación final» solo reevalúa a quien quedó pendiente de recuperación.
        </p>
      </Card>

      {resumen && <ResumenDelCierre resumen={resumen} />}
      {!grupoId && <Alert tone="info">Elige un grupo para ver cómo quedaría su promoción.</Alert>}
      {simulacion.isLoading && grupoId && <Spinner />}
      {simulacion.isError && <Alert tone="error">{errorMessage(simulacion.error)}</Alert>}

      {grupoId && simulacion.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {filas.length} estudiante(s) · {porCerrar.length} por cerrar · {filas.length - porCerrar.length} ya cerrados
            </p>
            {puedeCerrar && (
              <Button
                onClick={() => setCerrando(true)}
                disabled={porCerrar.length === 0 || anioEstado !== 'EN_CURSO' || incompletos.length > 0}
                title={
                  anioEstado !== 'EN_CURSO'
                    ? 'Solo se cierra la promoción de un año en curso.'
                    : incompletos.length > 0
                      ? `${incompletos.length} estudiante(s) no tienen todas sus notas anuales cerradas.`
                      : undefined
                }
              >
                Cerrar el grupo
              </Button>
            )}
          </div>
          {incompletos.length > 0 && (
            <Alert tone="warning">
              {incompletos.length} estudiante(s) tienen notas anuales sin cerrar: el cierre es todo o nada, así que no se puede cerrar el grupo hasta completarlas.
            </Alert>
          )}
          <TablaSimulacion filas={filas} />
        </>
      )}

      {cerrando && anioId && (
        <ConfirmarCierre
          anioId={anioId}
          grupoId={grupoId}
          momento={momento}
          cantidad={porCerrar.length}
          onClose={() => setCerrando(false)}
          onCerrado={(r) => {
            setResumen(r);
            setCerrando(false);
          }}
        />
      )}
    </div>
  );
}

function ResumenDelCierre({ resumen }: { resumen: ResumenCierre }) {
  return (
    <Alert tone={resumen.bloqueados.length > 0 ? 'warning' : 'success'}>
      <strong>{resumen.cerrados} estudiante(s) cerrados</strong>
      {resumen.omitidos > 0 && ` · ${resumen.omitidos} ya estaban cerrados`}.{' '}
      {Object.entries(resumen.por_resultado)
        .map(([r, n]) => `${NOMBRES_RESULTADO[r as ResultadoPromocion]}: ${n}`)
        .join(' · ')}
      {resumen.bloqueados.length > 0 && (
        <span className="mt-1 block">
          {resumen.bloqueados.length} estudiante(s) quedan sin cierre hasta registrar su nivelación (promoción anticipada); el resto del grupo sí se cerró.
        </span>
      )}
    </Alert>
  );
}

function TablaSimulacion({ filas }: { filas: FilaPromocion[] }) {
  return (
    <Table>
      <TableHead>
        <Th>Estudiante</Th>
        <Th>Situación</Th>
        <Th>Resultado</Th>
        <Th>Por qué</Th>
      </TableHead>
      <TableBody>
        {filas.length === 0 && <EmptyRow colSpan={4}>El grupo no tiene estudiantes con matrícula activa.</EmptyRow>}
        {filas.map((f) => {
          const resultado = f.motor?.resultado ?? f.cerrado?.resultado;
          return (
            <tr key={f.student_id}>
              <Td>
                {f.estudiante.apellido} {f.estudiante.nombre}
                <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
              </Td>
              <Td>{f.cerrado ? <Chip tone="neutral">Cerrado (v{f.cerrado.version})</Chip> : <Chip tone="blue">Por cerrar</Chip>}</Td>
              <Td>{resultado ? <Chip tone={TONO_RESULTADO[resultado]}>{NOMBRES_RESULTADO[resultado]}</Chip> : '—'}</Td>
              <Td>
                {f.motor ? (
                  <ul className="space-y-0.5 text-xs text-body">
                    {f.motor.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                    {f.motor.sin_nota.length > 0 && <li className="text-warning">Sin nota anual: {f.motor.sin_nota.join(', ')}</li>}
                    {f.motor.no_renueva_cupo && <li className="text-danger">Una regla dispone no renovar el cupo.</li>}
                  </ul>
                ) : (
                  <span className="text-xs text-muted">Ya tiene cierre en este momento.</span>
                )}
              </Td>
            </tr>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ConfirmarCierre({
  anioId,
  grupoId,
  momento,
  cantidad,
  onClose,
  onCerrado,
}: {
  anioId: string;
  grupoId: string;
  momento: MomentoPromocion;
  cantidad: number;
  onClose: () => void;
  onCerrado: (r: ResumenCierre) => void;
}) {
  const cerrar = useCerrarGrupoPromocion();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      onCerrado(await cerrar.mutateAsync({ academic_year_id: anioId, group_id: grupoId, momento, confirm_password: clave }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title="Cerrar la promoción del grupo" subtitle={NOMBRES_MOMENTO_PROMOCION[momento]} onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Cerrar el grupo" isSubmitting={cerrar.isPending} submitDisabled={!clave}>
      <Alert tone="warning">
        Se guardará el resultado de {cantidad} estudiante(s) con su huella de integridad. Quedará como una versión del cierre: corregirlo después exige un motivo, y una decisión de la comisión solo se cambia con una nueva sesión.
      </Alert>
      <Input label="Tu contraseña de administrador" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
