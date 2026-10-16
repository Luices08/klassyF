import { type FormEvent, useState } from 'react';
import { useGroups } from '../../hooks/useGroups';
import { useOtorgarProrroga } from '../../hooks/useAniosLectivos';
import { useUsers } from '../../hooks/useUsers';
import { aInputFechaHora } from '../../lib/fechas';
import { opcionesDeGrupos, opcionesDePersonas } from '../../lib/opcionesBuscables';
import type { AcademicYear } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { SelectBuscable } from '../ui/SelectBuscable';

const HORAS_POR_DEFECTO = 24;

interface ProrrogaDrawerProps {
  open: boolean;
  anio: AcademicYear;
  /** Periodo preseleccionado (al abrir desde su tarjeta). */
  periodoInicial?: number;
  onClose: () => void;
}

/** Prórroga excepcional para digitar notas de un periodo (CU-CRD-05): a un docente, a un grupo o a ambos. */
export function ProrrogaDrawer(props: ProrrogaDrawerProps) {
  if (!props.open) return null;
  return <FormularioProrroga {...props} />;
}

function FormularioProrroga({ anio, periodoInicial, onClose }: ProrrogaDrawerProps) {
  const periodosConcedibles = anio.periodos.filter((p) => p.estado !== 'PROGRAMADO');

  const docentesQuery = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  const gruposQuery = useGroups({ academic_year_id: anio._id });
  const otorgar = useOtorgarProrroga();

  const [periodo, setPeriodo] = useState(periodoInicial ?? periodosConcedibles[0]?.numero ?? 1);
  const [docenteId, setDocenteId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [hasta, setHasta] = useState(() => aInputFechaHora(new Date(Date.now() + HORAS_POR_DEFECTO * 3_600_000)));
  const [justificacion, setJustificacion] = useState('');

  const sinDestinatario = !docenteId && !grupoId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    otorgar.reset();
    await otorgar.mutateAsync({
      anioId: anio._id,
      periodo_numero: periodo,
      docente_id: docenteId || null,
      group_id: grupoId || null,
      hasta: new Date(hasta).toISOString(),
      justificacion: justificacion.trim(),
    });
    onClose();
  }

  return (
    <Drawer
      open
      title="Conceder prórroga"
      subtitle="Habilita temporalmente la digitación de notas fuera de la ventana. Queda en auditoría."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Conceder prórroga"
      isSubmitting={otorgar.isPending}
      submitDisabled={sinDestinatario || justificacion.trim().length < 10}
    >
      {otorgar.isError && <Alert tone="error">{errorMessage(otorgar.error)}</Alert>}

      <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
        {periodosConcedibles.map((p) => (
          <option key={p.numero} value={p.numero}>
            {p.nombre}
          </option>
        ))}
      </Select>

      <SelectBuscable
        label="Docente"
        value={docenteId}
        onChange={setDocenteId}
        placeholder="Buscar por nombre o documento…"
        vacioLabel="Cualquier docente del grupo"
        opciones={opcionesDePersonas(docentesQuery.data ?? [])}
      />

      <SelectBuscable
        label="Grupo"
        value={grupoId}
        onChange={setGrupoId}
        placeholder="Buscar grupo…"
        vacioLabel="Todos los grupos del docente"
        opciones={opcionesDeGrupos(gruposQuery.data ?? [])}
        hint="Si eliges docente y grupo, la prórroga aplica solo al docente en ese grupo."
      />

      {sinDestinatario && <Alert tone="warning">Elige al menos un docente o un grupo.</Alert>}

      <Input label="Vence el" type="datetime-local" required value={hasta} onChange={(e) => setHasta(e.target.value)} />
      <Input
        label="Justificación"
        required
        minLength={10}
        value={justificacion}
        onChange={(e) => setJustificacion(e.target.value)}
        hint="Mínimo 10 caracteres. Ej. nota rezagada por incapacidad médica."
      />
    </Drawer>
  );
}
