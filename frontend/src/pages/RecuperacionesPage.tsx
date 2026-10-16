import { type FormEvent, useState } from 'react';
import { PoliticaRecuperacionCard } from '../components/recuperaciones/PoliticaRecuperacionCard';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Input, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';
import { useGroups } from '../hooks/useGroups';
import {
  type EstadoRecuperacion,
  type FilaRecuperacion,
  NOMBRES_ESTADO_RECUPERACION,
  NOMBRES_MOMENTO,
  type TipoRecuperacion,
  useCandidatosRecuperacion,
  useRegistrarIntento,
} from '../hooks/useRecuperaciones';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import { aInputFecha } from '../lib/fechas';
import { SelectBuscable } from '../components/ui/SelectBuscable';
import { opcionesDeGrupos } from '../lib/opcionesBuscables';

const TONO_ESTADO: Record<EstadoRecuperacion, Tone> = { PENDIENTE: 'orange', SUPERADA: 'green', NO_SUPERADA: 'red' };

/**
 * M18: recuperaciones. La política (qué periodos se recuperan, cuándo y cómo afecta la nota) es del colegio y la define el ADMIN;
 * el docente registra el resultado de sus estudiantes dentro de la ventana que el calendario del año marca.
 */
export function RecuperacionesPage() {
  const { user } = useAuth();
  const esDocente = user?.rol === 'DOCENTE';
  const esAdmin = user?.rol === 'ADMIN';
  const { anio } = useAnioDeTrabajo();
  const [pestana, setPestana] = useState('recuperaciones');

  return (
    <div className="space-y-4">
      <PageHeader title="Recuperaciones" subtitle="Estrategias de apoyo para quienes no alcanzaron el desempeño básico, según el SIEE del colegio." />
      <Tabs
        items={[
          { key: 'recuperaciones', label: 'Recuperaciones' },
          { key: 'politica', label: 'Política del colegio' },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      {pestana === 'politica' ? (
        <PoliticaRecuperacionCard academicYearId={anio?._id} puedeEditar={esAdmin && anio?.estado !== 'CERRADO'} />
      ) : (
        <Listado esDocente={esDocente} anioId={anio?._id} periodos={anio?.periodos ?? []} />
      )}
    </div>
  );
}

function Listado({ esDocente, anioId, periodos }: { esDocente: boolean; anioId?: string; periodos: Array<{ numero: number; nombre: string; fecha_inicio: string; fecha_fin: string }> }) {
  const { data: carga = [] } = useMyTeacherLoad(esDocente ? anioId : undefined);
  const clases = carga.filter((a) => a.tipo_asignacion === 'CLASE');
  const grupos = useGroups({ academic_year_id: esDocente ? undefined : anioId });

  const [claseId, setClaseId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [tipo, setTipo] = useState<TipoRecuperacion>('PERIODO');
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const [registrando, setRegistrando] = useState<FilaRecuperacion | null>(null);

  const clase = clases.find((c) => c._id === claseId) ?? clases[0];
  const grupo = (grupos.data ?? []).find((g) => g._id === grupoId) ?? (grupos.data ?? [])[0];
  const periodo = periodos.find((p) => p.numero === periodoElegido) ?? periodos[0];

  const filtros = {
    academic_year_id: anioId,
    tipo,
    periodo_numero: tipo === 'PERIODO' ? periodo?.numero : undefined,
    teacher_assignment_id: esDocente ? clase?._id : undefined,
    group_id: esDocente ? undefined : grupo?._id,
  };
  const listo = esDocente ? Boolean(clase) : Boolean(grupo);
  const { data, isLoading, isError, error } = useCandidatosRecuperacion(filtros, listo && (tipo === 'ANUAL' || Boolean(periodo)));

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {esDocente ? (
            <Select label="Clase" value={clase?._id ?? ''} onChange={(e) => setClaseId(e.target.value)}>
              {clases.map((c) => (
                <option key={c._id} value={c._id}>
                  {typeof c.subject_id === 'object' && c.subject_id ? c.subject_id.nombre : 'Asignatura'} ·{' '}
                  {typeof c.group_id === 'object' && c.group_id ? c.group_id.nomenclatura : ''}
                </option>
              ))}
            </Select>
          ) : (
            <SelectBuscable
              label="Grupo"
              value={grupo?._id ?? ''}
              onChange={setGrupoId}
              placeholder="Buscar grupo…"
              opciones={opcionesDeGrupos(grupos.data ?? [])}
            />
          )}
          <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecuperacion)}>
            <option value="PERIODO">Recuperación de periodo</option>
            <option value="ANUAL">Recuperación de fin de año</option>
          </Select>
          {tipo === 'PERIODO' && (
            <Select label="Periodo" value={periodo?.numero ?? ''} onChange={(e) => setPeriodoElegido(Number(e.target.value))}>
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre} ({aInputFecha(p.fecha_inicio)} a {aInputFecha(p.fecha_fin)})
                </option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && !data.aplica && <Alert tone="info">{data.motivo_no_aplica}</Alert>}
      {data?.aplica && (
        <>
          <Alert tone={data.ventana?.abierta ? 'success' : 'warning'}>
            {data.ventana?.abierta
              ? `Ventana abierta hasta el ${aInputFecha(data.ventana.hasta ?? '')}.`
              : (data.ventana?.motivo ?? 'No hay ventana de recuperación.')}
            {data.momento && ` Momento configurado: ${NOMBRES_MOMENTO[data.momento].toLowerCase()}.`} Nota aprobatoria: {data.nota_aprobatoria}.
          </Alert>
          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Asignatura</Th>
              <Th>Nota original</Th>
              <Th>Intentos</Th>
              <Th>Nota resultante</Th>
              <Th>Estado</Th>
              <Th>{''}</Th>
            </TableHead>
            <TableBody>
              {data.filas.length === 0 && <EmptyRow colSpan={7}>Nadie debe recuperar con las notas cerradas hasta ahora.</EmptyRow>}
              {data.filas.map((f) => (
                <tr key={`${f.teacher_assignment_id}-${f.estudiante._id}`}>
                  <Td>
                    {f.estudiante.apellido} {f.estudiante.nombre}
                    <span className="block text-xs text-muted">{f.estudiante.numero_documento}</span>
                  </Td>
                  <Td>
                    {f.asignatura} · {f.grupo}
                  </Td>
                  <Td>{f.nota_original}</Td>
                  <Td>{f.recuperacion?.intentos.map((i) => i.nota).join(' · ') || '—'}</Td>
                  <Td>{f.recuperacion?.nota_resultante ?? '—'}</Td>
                  <Td>
                    <Chip tone={TONO_ESTADO[f.estado]}>{NOMBRES_ESTADO_RECUPERACION[f.estado]}</Chip>
                    {f.recuperacion?.detalle && <span className="mt-1 block text-xs text-muted">{f.recuperacion.detalle}</span>}
                  </Td>
                  <Td>
                    {esDocente && (
                      <Button
                        variant="soft-edit"
                        disabled={!f.habilitado || !data.ventana?.abierta}
                        title={f.motivo_no_habilitado ?? (data.ventana?.abierta ? undefined : (data.ventana?.motivo ?? undefined))}
                        onClick={() => setRegistrando(f)}
                      >
                        Registrar
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {registrando && <IntentoDrawer fila={registrando} tipo={tipo} periodo={periodo?.numero} onClose={() => setRegistrando(null)} />}
    </div>
  );
}

function IntentoDrawer({ fila, tipo, periodo, onClose }: { fila: FilaRecuperacion; tipo: TipoRecuperacion; periodo?: number; onClose: () => void }) {
  const registrar = useRegistrarIntento();
  const [nota, setNota] = useState('');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await registrar.mutateAsync({
        teacher_assignment_id: fila.teacher_assignment_id,
        student_id: fila.estudiante._id,
        tipo,
        periodo_numero: tipo === 'PERIODO' ? periodo : undefined,
        nota: Number(nota),
        observacion: observacion || undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer
      open
      title="Registrar resultado"
      subtitle={`${fila.estudiante.apellido} ${fila.estudiante.nombre} · ${fila.asignatura}`}
      onClose={onClose}
      onSubmit={(e) => void enviar(e)}
      submitLabel="Guardar"
      isSubmitting={registrar.isPending}
      submitDisabled={nota === ''}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Nota original: {fila.nota_original}. Intentos restantes: {fila.intentos_restantes}.
        </p>
        <Input label="Nota de la recuperación" type="number" step="any" min={0} value={nota} onChange={(e) => setNota(e.target.value)} />
        <Textarea label="Observación (opcional)" rows={3} maxLength={1000} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Drawer>
  );
}
