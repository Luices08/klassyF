import { type FormEvent, useState } from 'react';
import { EspacioDrawer } from '../../components/espacios/EspacioDrawer';
import { FranjasJornadaDrawer } from '../../components/jornadas/FranjasJornadaDrawer';
import { MallaOcupacionEspacio } from '../../components/espacios/MallaOcupacionEspacio';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoEspacioBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useJornadas } from '../../hooks/useCatalogs';
import { useCambiarEstadoEspacio, useEliminarEspacio, useEspacios } from '../../hooks/useEspacios';
import { useInstitution } from '../../hooks/useInstitution';
import {
  NOMBRES_TIPO_ESPACIO,
  TIPOS_ESPACIO,
  type Espacio,
  type JornadaOperativa,
  type RecursoEspacio,
  type TipoEspacio,
} from '../../types/domain';

// Etiquetas cortas para la columna de recursos (los nombres completos están en el formulario).
const RECURSO_CORTO: Record<RecursoEspacio, string> = {
  VIDEO_BEAM_TV: 'Video beam / TV',
  CLIMATIZACION: 'Clima',
  INTERNET: 'Internet',
  RED_CABLEADA: 'Red cableada',
  LAVAMANOS_GAS: 'Lavamanos / gas',
};
const MAX_RECURSOS_VISIBLES = 3;

export function EspaciosPage() {
  const institutionQuery = useInstitution();
  const sedesQuery = useCampuses(institutionQuery.data?._id);
  const sedes = sedesQuery.data ?? [];
  const { anio } = useAnioDeTrabajo();
  const esVirtual = institutionQuery.data?.modalidad === 'VIRTUAL';

  const [filtroSede, setFiltroSede] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoEspacio | ''>('');
  const espaciosQuery = useEspacios({
    sede_id: filtroSede || undefined,
    tipo_espacio: filtroTipo || undefined,
    academic_year_id: anio?._id,
  });
  const espacios = espaciosQuery.data ?? [];

  const [drawer, setDrawer] = useState<{ espacio: Espacio | null } | null>(null);
  const [eliminando, setEliminando] = useState<Espacio | null>(null);
  const eliminar = useEliminarEspacio();
  const cambiarEstado = useCambiarEstadoEspacio();

  const [mallaId, setMallaId] = useState('');
  const espacioMalla = espacios.find((e) => e._id === mallaId) ?? espacios[0];

  // La malla es por espacio Y jornada: los días y las franjas salen de la jornada de la sede del espacio.
  const jornadasQuery = useJornadas(espacioMalla?.sede_id._id);
  const jornadas = jornadasQuery.data ?? [];
  const [jornadaMallaId, setJornadaMallaId] = useState('');
  const jornadaMalla = jornadas.find((j) => j._id === jornadaMallaId) ?? jornadas[0];
  const [configurandoFranjas, setConfigurandoFranjas] = useState<JornadaOperativa | null>(null);

  async function handleEliminar(e: FormEvent) {
    e.preventDefault();
    if (!eliminando) return;
    eliminar.reset();
    await eliminar.mutateAsync(eliminando._id);
    setEliminando(null);
  }

  function handleAlternarMantenimiento(espacio: Espacio) {
    cambiarEstado.reset();
    cambiarEstado.mutate({ id: espacio._id, estado: espacio.estado === 'DISPONIBLE' ? 'EN_MANTENIMIENTO' : 'DISPONIBLE' });
  }

  const sinSedes = !sedesQuery.isLoading && sedes.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Espacios y aulas"
        subtitle="Inventario físico de cada sede. Es opcional: si asignas un aula al crear un grupo, su aforo limita el cupo."
        action={
          <Button onClick={() => setDrawer({ espacio: null })} disabled={sinSedes || esVirtual}>
            <PlusIcon className="h-4 w-4" />
            Nuevo espacio
          </Button>
        }
      />

      {esVirtual && (
        <Alert tone="info">
          La institución está configurada como virtual: no usa espacios físicos, así que no se registran espacios ni se asignan
          aulas a los grupos. Puedes cambiarlo en Configuración institucional.
        </Alert>
      )}
      {sinSedes && <Alert tone="info">Aún no hay sedes. Configura primero la institución y sus sedes.</Alert>}

      <Card>
        <CardHeader
          title="Directorio de espacios"
          subtitle={anio ? `Los grupos titulares que se muestran son los de ${anio.nombre}.` : undefined}
        />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Sede" value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Tipo de espacio" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoEspacio | '')}>
            <option value="">Todos los tipos</option>
            {TIPOS_ESPACIO.map((t) => (
              <option key={t} value={t}>
                {NOMBRES_TIPO_ESPACIO[t]}
              </option>
            ))}
          </Select>
        </div>

        {espaciosQuery.isLoading && <Spinner />}
        {espaciosQuery.isError && <Alert tone="error">{errorMessage(espaciosQuery.error)}</Alert>}
        {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}

        {espaciosQuery.data && (
          <Table>
            <TableHead>
              <Th>Sede</Th>
              <Th>Espacio</Th>
              <Th>Tipo</Th>
              <Th>Aforo</Th>
              <Th>Recursos</Th>
              <Th>Grupos titulares</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {espacios.map((e) => {
                const visibles = e.recursos.slice(0, MAX_RECURSOS_VISIBLES);
                const restantes = e.recursos.length - visibles.length;
                return (
                  <tr key={e._id}>
                    <Td>{e.sede_id.nombre}</Td>
                    <Td>
                      <p className="font-medium text-ink">{e.nombre}</p>
                      <p className="text-xs text-muted">
                        {[e.piso_bloque, e.admite_grupos_simultaneos ? 'Uso simultáneo' : null].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </Td>
                    <Td>{NOMBRES_TIPO_ESPACIO[e.tipo_espacio]}</Td>
                    <Td>
                      <span className="font-semibold text-ink">{e.capacidad}</span>
                      {e.sobrecupo && (
                        <span className="ml-2">
                          <Chip tone="red">Sobrecupo</Chip>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {visibles.map((r) => (
                          <Chip key={r} tone="neutral">
                            {RECURSO_CORTO[r]}
                          </Chip>
                        ))}
                        {restantes > 0 && <Chip tone="neutral">+{restantes}</Chip>}
                        {e.computadores_operativos > 0 && <Chip tone="blue">{e.computadores_operativos} PC</Chip>}
                        {e.recursos.length === 0 && e.computadores_operativos === 0 && <span className="text-muted">—</span>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {e.grupos_asignados.map((g) => (
                          <Chip key={g._id} tone={g.max_capacity > e.capacidad ? 'red' : 'blue'}>
                            {g.nomenclatura} · {g.max_capacity}
                          </Chip>
                        ))}
                        {e.grupos_asignados.length === 0 && <span className="text-muted">—</span>}
                      </div>
                    </Td>
                    <Td>
                      <EstadoEspacioBadge value={e.estado} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <IconButton tone="edit" label="Editar espacio" icon={<PencilIcon />} onClick={() => setDrawer({ espacio: e })} />
                        <IconButton
                          tone={e.estado === 'DISPONIBLE' ? 'neutral' : 'success'}
                          label={e.estado === 'DISPONIBLE' ? 'Poner en mantenimiento' : 'Habilitar espacio'}
                          icon={e.estado === 'DISPONIBLE' ? <BanIcon /> : <RefreshIcon />}
                          disabled={cambiarEstado.isPending}
                          onClick={() => handleAlternarMantenimiento(e)}
                        />
                        <IconButton
                          tone="danger"
                          label="Eliminar espacio"
                          icon={<TrashIcon />}
                          onClick={() => {
                            eliminar.reset();
                            setEliminando(e);
                          }}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {espacios.length === 0 && <EmptyRow colSpan={8}>Sin espacios registrados con estos filtros.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      {espacioMalla && (
        <Card>
          <CardHeader
            title="Malla semanal de ocupación"
            subtitle="Qué franjas de la semana tiene tomadas el espacio y por qué grupo."
            action={
              <div className="flex flex-wrap justify-end gap-3">
                <Select label="Espacio" value={espacioMalla._id} onChange={(e) => setMallaId(e.target.value)} className="w-60">
                  {espacios.map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.sede_id.nombre} · {e.nombre}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Jornada"
                  value={jornadaMalla?._id ?? ''}
                  onChange={(e) => setJornadaMallaId(e.target.value)}
                  disabled={jornadas.length === 0}
                  className="w-56"
                >
                  {jornadas.length === 0 && <option value="">Sin jornadas</option>}
                  {jornadas.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.nombre} · {j.hora_inicio}–{j.hora_fin}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <MallaOcupacionEspacio
            espacio={espacioMalla}
            jornada={jornadaMalla}
            onConfigurarFranjas={() => jornadaMalla && setConfigurandoFranjas(jornadaMalla)}
          />
        </Card>
      )}

      <FranjasJornadaDrawer
        open={configurandoFranjas !== null}
        jornada={configurandoFranjas}
        onClose={() => setConfigurandoFranjas(null)}
      />

      <EspacioDrawer
        open={drawer !== null}
        espacio={drawer?.espacio ?? null}
        sedes={sedes}
        sedeInicialId={filtroSede || undefined}
        onClose={() => setDrawer(null)}
      />

      <Drawer
        open={eliminando !== null}
        title="Eliminar espacio"
        onClose={() => setEliminando(null)}
        onSubmit={handleEliminar}
        submitLabel="Sí, eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        {eliminar.isError && <Alert tone="error">{errorMessage(eliminar.error)}</Alert>}
        <Alert tone="warning">
          Esta acción no se puede deshacer. Un espacio que es el salón titular de algún grupo no se puede eliminar: si solo
          está dañado o en obras, ponlo en mantenimiento.
        </Alert>
        <p className="text-sm text-body">
          ¿Eliminar <strong>{eliminando?.nombre}</strong> ({eliminando?.sede_id.nombre})?
        </p>
      </Drawer>
    </div>
  );
}
