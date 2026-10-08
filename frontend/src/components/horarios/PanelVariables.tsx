import { type FormEvent, useState } from 'react';
import {
  useCambiarEstadoVariableHorario,
  useEliminarVariableHorario,
  type ContextoHorario,
} from '../../hooks/useHorarios';
import type { Grade } from '../../types/domain';
import { METADATOS_VARIABLE, type CatalogoHorario, type VariableHorario } from '../../types/horarios';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Chip, EstadoUsuarioBadge } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui/IconButton';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../ui/icons';
import { VariableDrawer } from './VariableDrawer';

interface PanelVariablesProps {
  contexto: ContextoHorario;
  variables: VariableHorario[];
  grados: Grade[];
  catalogo: CatalogoHorario;
  espacios: Array<{ _id: string; nombre: string }>;
}

const MAX_CHIPS = 3;

/** Lo esencial de los parámetros, para reconocer la variable sin abrirla. */
function resumenParametros(v: VariableHorario, nombreEspacio: Map<string, string>): string | null {
  const p = v.parametros;
  switch (v.tipo) {
    case 'DISTRIBUCION_BLOQUES':
      return `Bloques ${(p.bloques as number[]).join(' + ')}`;
    case 'REUNION_COLECTIVA':
      return `${String(p.nombre)} · ${String(p.duracion)} h × ${String(p.sesiones ?? 1)}`;
    case 'DISTRIBUCION_SEMANAL':
      return [p.max_sesiones_dia ? `Máx. ${String(p.max_sesiones_dia)} por día` : null, p.min_dias_distintos ? `mín. ${String(p.min_dias_distintos)} días` : null]
        .filter(Boolean)
        .join(', ');
    case 'CONSECUTIVAS':
      return p.orden === 'ESPECIFICADO' ? 'En el orden elegido' : 'Cualquier orden';
    case 'MAX_HORAS_DIA_GRUPO':
    case 'MAX_HORAS_DIA_DOCENTE':
    case 'MAX_CONSECUTIVAS_DOCENTE':
      return `Máximo ${String(p.max)}`;
    case 'MAX_HUECOS_GRUPO':
    case 'MAX_HUECOS_DOCENTE':
      return `Máximo ${String(p.max_por_dia)} por día`;
    case 'ESPACIO_REQUERIDO':
      return (p.espacio_ids as string[]).map((id) => nombreEspacio.get(id) ?? 'Espacio').join(', ');
    default:
      return null;
  }
}

function ListaChips({ nombres, vacio }: { nombres: string[]; vacio: string }) {
  if (nombres.length === 0) return <span className="text-muted">{vacio}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {nombres.slice(0, MAX_CHIPS).map((n) => (
        <Chip key={n} tone="neutral">
          {n}
        </Chip>
      ))}
      {nombres.length > MAX_CHIPS && <Chip tone="neutral">+{nombres.length - MAX_CHIPS}</Chip>}
    </div>
  );
}

/** Restricciones y preferencias de la jornada, salvo el tiempo libre (tiene su propia pestaña con la malla). */
export function PanelVariables({ contexto, variables, grados, catalogo, espacios }: PanelVariablesProps) {
  const [drawer, setDrawer] = useState<{ variable: VariableHorario | null } | null>(null);
  const [eliminando, setEliminando] = useState<VariableHorario | null>(null);
  const cambiarEstado = useCambiarEstadoVariableHorario();
  const eliminar = useEliminarVariableHorario();

  const nombreGrado = new Map(grados.map((g) => [g._id, g.nombre]));
  const nombreAsignatura = new Map(catalogo.asignaturas.map((s) => [s._id, s.nombre]));
  const nombreDocente = new Map(catalogo.docentes.map((d) => [d._id, d.nombre]));
  const nombreEspacio = new Map(espacios.map((e) => [e._id, e.nombre]));
  const lista = variables.filter((v) => v.tipo !== 'DISPONIBILIDAD');

  async function handleEliminar(e: FormEvent) {
    e.preventDefault();
    if (!eliminando) return;
    await eliminar.mutateAsync(eliminando._id);
    setEliminando(null);
  }

  return (
    <Card>
      <CardHeader
        title="Variables del horario"
        subtitle="Las obligatorias se cumplen siempre; las preferencias, según su importancia. Si dos chocan, gana la más específica."
        action={
          <Button onClick={() => setDrawer({ variable: null })}>
            <PlusIcon className="h-4 w-4" />
            Nueva variable
          </Button>
        }
      />
      {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}

      <Table>
        <TableHead>
          <Th>Condición</Th>
          <Th>Aplica a</Th>
          <Th>Asignaturas / docentes</Th>
          <Th>Regla</Th>
          <Th>Estado</Th>
          <Th />
        </TableHead>
        <TableBody>
          {lista.length === 0 && (
            <EmptyRow colSpan={6}>Sin variables. Empieza por cómo partir las horas en bloques y que el descanso no parta un bloque.</EmptyRow>
          )}
          {lista.map((v) => {
            const meta = METADATOS_VARIABLE[v.tipo];
            const filtros = [
              ...v.asignatura_ids.map((id) => nombreAsignatura.get(id) ?? 'Asignatura'),
              ...v.docente_ids.map((id) => nombreDocente.get(id) ?? 'Docente'),
            ];
            return (
              <tr key={v._id} className={v.estado === 'inactivo' ? 'opacity-60' : ''}>
                <Td>
                  <p className="font-medium text-ink">{meta.etiqueta}</p>
                  <p className="text-xs text-muted">
                    {[resumenParametros(v, nombreEspacio), v.descripcion, v.es_excepcion ? 'Excepción' : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                </Td>
                <Td>
                  {v.alcance.tipo === 'GLOBAL' ? (
                    <span className="text-body">Todos los grados</span>
                  ) : (
                    <ListaChips nombres={v.alcance.grade_ids.map((id) => nombreGrado.get(id) ?? 'Grado inactivo')} vacio="—" />
                  )}
                </Td>
                <Td>
                  <ListaChips nombres={filtros} vacio={meta.usaDocentes ? 'Todos los docentes' : 'Todas'} />
                </Td>
                <Td>{v.severidad === 'DURA' ? <Chip tone="blue">Obligatoria</Chip> : <Chip tone="neutral">Preferencia · {v.peso}</Chip>}</Td>
                <Td>
                  <EstadoUsuarioBadge value={v.estado} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton tone="edit" label="Editar variable" icon={<PencilIcon />} onClick={() => setDrawer({ variable: v })} />
                    <IconButton
                      tone={v.estado === 'activo' ? 'neutral' : 'success'}
                      label={v.estado === 'activo' ? 'Desactivar variable' : 'Activar variable'}
                      icon={v.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                      disabled={cambiarEstado.isPending}
                      onClick={() => cambiarEstado.mutate({ id: v._id, estado: v.estado === 'activo' ? 'inactivo' : 'activo' })}
                    />
                    <IconButton tone="danger" label="Eliminar variable" icon={<TrashIcon />} onClick={() => setEliminando(v)} />
                  </div>
                </Td>
              </tr>
            );
          })}
        </TableBody>
      </Table>

      <VariableDrawer
        open={drawer !== null}
        variable={drawer?.variable ?? null}
        contexto={contexto}
        grados={grados}
        catalogo={catalogo}
        espacios={espacios}
        onClose={() => setDrawer(null)}
      />

      <Drawer
        open={eliminando !== null}
        title="Eliminar variable"
        onClose={() => setEliminando(null)}
        onSubmit={handleEliminar}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        <div className="space-y-3 text-sm text-body">
          {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
          <p>
            Se eliminará «{eliminando ? METADATOS_VARIABLE[eliminando.tipo].etiqueta : ''}». Los horarios ya generados no cambian; las
            próximas generaciones ya no la tendrán en cuenta.
          </p>
          <p className="text-muted">Si solo quieres probar sin ella, desactívala en vez de eliminarla.</p>
        </div>
      </Drawer>
    </Card>
  );
}
