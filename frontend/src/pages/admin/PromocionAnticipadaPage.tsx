import { type FormEvent, useState } from 'react';
import { ConfiguracionAnticipadaCard } from '../../components/promocion/ConfiguracionAnticipadaCard';
import { TONO_ESTADO_ANTICIPADA } from '../../components/promocion/tonosAnticipada';
import { TramiteAnticipadaDrawer } from '../../components/promocion/TramiteAnticipadaDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useEnrollmentsList } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import {
  type EstadoAnticipada,
  NOMBRES_ESTADO_ANTICIPADA,
  NOMBRES_TIPO_ANTICIPADA,
  type TipoAnticipada,
  type TramiteAnticipada,
  useSolicitarAnticipada,
  useTramitesAnticipada,
} from '../../hooks/usePromocionAnticipada';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';

const nombreDe = (t: TramiteAnticipada) => (typeof t.student_id === 'object' ? `${t.student_id.apellido} ${t.student_id.nombre}` : 'Estudiante');

/**
 * M19: promoción anticipada y reiniciantes (Decreto 1290, art. 7). La comisión recomienda y el Consejo Directivo decide en sus sesiones;
 * aquí se abre el trámite, se registra el consentimiento de la familia, se emite la resolución rectoral y se pasa al estudiante de grado.
 */
export function PromocionAnticipadaPage() {
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  const [pestana, setPestana] = useState('tramites');
  const [estado, setEstado] = useState<EstadoAnticipada | ''>('');
  const [tipo, setTipo] = useState<TipoAnticipada | ''>('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<TramiteAnticipada | null>(null);

  const lista = useTramitesAnticipada({ academic_year_id: anio?._id, estado: estado || undefined, tipo: tipo || undefined });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Promoción anticipada"
        subtitle="Estudiantes con desempeño superior y reiniciantes que pasan al grado siguiente durante el año, con el concepto de la comisión, el consentimiento de la familia y la decisión del Consejo Directivo."
        action={pestana === 'tramites' ? <Button onClick={() => setNuevo(true)}>Nuevo trámite</Button> : undefined}
      />
      <Tabs
        items={[
          { key: 'tramites', label: 'Trámites' },
          { key: 'configuracion', label: 'Criterios del colegio' },
        ]}
        value={pestana}
        onChange={setPestana}
      />

      {pestana === 'configuracion' ? (
        <ConfiguracionAnticipadaCard puedeEditar={user?.rol === 'ADMIN'} />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoAnticipada | '')}>
                <option value="">Todos</option>
                {(Object.keys(NOMBRES_ESTADO_ANTICIPADA) as EstadoAnticipada[]).map((e) => (
                  <option key={e} value={e}>
                    {NOMBRES_ESTADO_ANTICIPADA[e]}
                  </option>
                ))}
              </Select>
              <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAnticipada | '')}>
                <option value="">Todos</option>
                {(Object.keys(NOMBRES_TIPO_ANTICIPADA) as TipoAnticipada[]).map((t) => (
                  <option key={t} value={t}>
                    {NOMBRES_TIPO_ANTICIPADA[t]}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
          {lista.isLoading && <Spinner />}
          {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Tipo</Th>
              <Th>Estado</Th>
              <Th>Comisión</Th>
              <Th>Familia</Th>
              <Th>Consejo</Th>
              <Th>Resolución</Th>
              <Th>{''}</Th>
            </TableHead>
            <TableBody>
              {(lista.data ?? []).length === 0 && !lista.isLoading && <EmptyRow colSpan={8}>No hay trámites con ese filtro.</EmptyRow>}
              {(lista.data ?? []).map((t) => (
                <tr key={t._id}>
                  <Td>
                    {nombreDe(t)}
                    {typeof t.student_id === 'object' && <span className="block text-xs text-muted">{t.student_id.numero_documento}</span>}
                  </Td>
                  <Td>{NOMBRES_TIPO_ANTICIPADA[t.tipo]}</Td>
                  <Td>
                    <Chip tone={TONO_ESTADO_ANTICIPADA[t.estado]}>{NOMBRES_ESTADO_ANTICIPADA[t.estado]}</Chip>
                  </Td>
                  <Td>{t.concepto_comision ? (t.concepto_comision.favorable ? '✔' : '✘') : '—'}</Td>
                  <Td>{t.consentimiento ? (t.consentimiento.otorgado ? '✔' : '✘') : '—'}</Td>
                  <Td>{t.decision_consejo ? (t.decision_consejo.aprobada ? '✔' : '✘') : '—'}</Td>
                  <Td>{t.resolucion?.codigo ?? '—'}</Td>
                  <Td>
                    <Button variant="soft-edit" onClick={() => setAbierto(t)}>
                      Abrir
                    </Button>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nuevo && anio && <NuevoTramite anioId={anio._id} onClose={() => setNuevo(false)} onCreado={(t) => { setNuevo(false); setAbierto(t); }} />}
      {abierto && <TramiteAnticipadaDrawer id={abierto._id} nombreEstudiante={nombreDe(abierto)} anioId={anio?._id} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function NuevoTramite({ anioId, onClose, onCreado }: { anioId: string; onClose: () => void; onCreado: (t: TramiteAnticipada) => void }) {
  const grupos = useGroups({ academic_year_id: anioId });
  const solicitar = useSolicitarAnticipada();
  const [grupoId, setGrupoId] = useState('');
  const [matriculaId, setMatriculaId] = useState('');
  const [tipo, setTipo] = useState<TipoAnticipada>('RENDIMIENTO_EXCEPCIONAL');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matriculas = useEnrollmentsList({ academic_year_id: anioId, group_id: grupoId, limit: 100 }, Boolean(grupoId));
  const activas = (matriculas.data?.data ?? []).filter((m) => m.estado !== 'RETIRADO' && m.estado !== 'ANULADO');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const t = (await solicitar.mutateAsync({ enrollment_id: matriculaId, tipo, motivo: motivo || undefined })) as TramiteAnticipada;
      onCreado(t);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Drawer open title="Nuevo trámite de promoción anticipada" onClose={onClose} onSubmit={(e) => void enviar(e)} submitLabel="Abrir trámite" isSubmitting={solicitar.isPending} submitDisabled={!matriculaId}>
      <Alert tone="info">El sistema revisa las notas cerradas del periodo de evaluación contra el criterio del colegio. Si no las cumple, dirá por qué y no se abre el trámite.</Alert>
      <SelectBuscable label="Grupo del estudiante" value={grupoId} onChange={(v) => { setGrupoId(v); setMatriculaId(''); }} vacioLabel="Elige un grupo" placeholder="Buscar grupo…" opciones={opcionesDeGrupos(grupos.data ?? [])} />
      <SelectBuscable
        label="Estudiante"
        value={matriculaId}
        onChange={setMatriculaId}
        disabled={!grupoId}
        vacioLabel="Elige un estudiante"
        placeholder="Buscar estudiante…"
        opciones={activas.map((m) => ({
          value: m._id,
          label: typeof m.student_id === 'object' ? `${m.student_id.apellido}, ${m.student_id.nombre}` : 'Estudiante',
          detalle: typeof m.student_id === 'object' ? m.student_id.numero_documento : undefined,
        }))}
      />
      <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAnticipada)}>
        {(Object.keys(NOMBRES_TIPO_ANTICIPADA) as TipoAnticipada[]).map((t) => (
          <option key={t} value={t}>
            {NOMBRES_TIPO_ANTICIPADA[t]}
          </option>
        ))}
      </Select>
      <Textarea label="Motivo de la solicitud (opcional)" rows={3} maxLength={3000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
    </Drawer>
  );
}
