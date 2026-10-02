import { useState, type FormEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Select, Textarea } from '../ui/Field';
import { useCrearJustificacion, useInasistencias } from '../../hooks/useAsistencia';
import { useEnrollmentsList } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { useStudentGuardians } from '../../hooks/useGuardians';
import { formatoFechaCalendario } from '../../lib/fechas';
import type { Group } from '../../types/domain';

/** Falla ya identificada (desde la planilla): se salta la búsqueda de grupo, estudiante y falla. */
export interface InasistenciaInicial {
  attendance_id: string;
  registro_id: string;
  student_id: string;
  descripcion: string;
}

interface JustificacionDrawerProps {
  academicYearId: string;
  inicial?: InasistenciaInicial;
  onClose: () => void;
}

const etiquetaGrupo = (g: Group) => `${typeof g.grade_id === 'object' ? g.grade_id.nombre : ''} ${g.nomenclatura}`.trim();

const TIPOS_SOPORTE = '.pdf,.jpg,.jpeg,.png,.webp';

/**
 * Registra la excusa de una inasistencia con su soporte, mientras no exista el portal del acudiente (M27): el
 * personal la carga en nombre del acudiente. Se monta solo mientras está abierto, así su estado nace limpio.
 */
export function JustificacionDrawer({ academicYearId, inicial, onClose }: JustificacionDrawerProps) {
  const crear = useCrearJustificacion();
  const [groupId, setGroupId] = useState('');
  const [studentElegido, setStudentElegido] = useState('');
  const [inasistenciaKey, setInasistenciaKey] = useState('');
  const [acudienteId, setAcudienteId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);

  const studentId = inicial?.student_id ?? studentElegido;

  const { data: grupos = [] } = useGroups({ academic_year_id: academicYearId });
  const { data: matriculas } = useEnrollmentsList(
    { academic_year_id: academicYearId, group_id: groupId, limit: 100 },
    !inicial && Boolean(groupId)
  );
  const { data: inasistencias = [] } = useInasistencias(studentId || undefined, academicYearId);
  const { data: acudientes = [] } = useStudentGuardians(studentId || undefined);

  const justificables = inasistencias.filter((i) => !i.justificacion);
  const [attendanceId, registroId] = inicial
    ? [inicial.attendance_id, inicial.registro_id]
    : (inasistenciaKey.split('|') as [string?, string?]);

  const estudiantes = (matriculas?.data ?? []).flatMap((m) => (typeof m.student_id === 'object' ? [m.student_id] : []));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!attendanceId || !registroId) return;
    await crear.mutateAsync({
      attendance_id: attendanceId,
      registro_id: registroId,
      motivo,
      acudiente_id: acudienteId || undefined,
      archivo,
    });
    onClose();
  }

  return (
    <Drawer
      open
      title="Nueva justificación"
      subtitle={inicial?.descripcion ?? 'Registra la excusa de una inasistencia con su soporte.'}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel="Registrar justificación"
      isSubmitting={crear.isPending}
      submitDisabled={!attendanceId || !registroId || motivo.trim().length < 3}
    >
      {crear.isError && <Alert tone="error">{errorMessage(crear.error)}</Alert>}

      {!inicial && (
        <>
          <Select
            label="Grupo"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setStudentElegido('');
              setInasistenciaKey('');
            }}
          >
            <option value="">Selecciona un grupo…</option>
            {grupos.map((g) => (
              <option key={g._id} value={g._id}>
                {etiquetaGrupo(g)}
              </option>
            ))}
          </Select>
          <Select
            label="Estudiante"
            value={studentElegido}
            disabled={!groupId}
            onChange={(e) => {
              setStudentElegido(e.target.value);
              setInasistenciaKey('');
              setAcudienteId('');
            }}
          >
            <option value="">Selecciona un estudiante…</option>
            {estudiantes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.apellido} {s.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Inasistencia"
            value={inasistenciaKey}
            disabled={!studentElegido}
            onChange={(e) => setInasistenciaKey(e.target.value)}
            hint={studentElegido && justificables.length === 0 ? 'Este estudiante no tiene inasistencias por justificar.' : undefined}
          >
            <option value="">Selecciona la inasistencia…</option>
            {justificables.map((i) => (
              <option key={i.registro_id} value={`${i.attendance_id}|${i.registro_id}`}>
                {formatoFechaCalendario(i.fecha)} · {i.asignatura} · {i.estado.nombre}
              </option>
            ))}
          </Select>
        </>
      )}

      <Select label="Acudiente que la presenta" value={acudienteId} onChange={(e) => setAcudienteId(e.target.value)}>
        <option value="">Sin especificar</option>
        {acudientes.map((r) => (
          <option key={r.guardian_id._id} value={r.guardian_id._id}>
            {r.guardian_id.nombre} {r.guardian_id.apellido}
          </option>
        ))}
      </Select>

      <Textarea
        label="Motivo"
        value={motivo}
        maxLength={1000}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej. Cita médica, incapacidad, calamidad doméstica…"
      />

      <div>
        <label htmlFor="soporte-justificacion" className="mb-1.5 block text-label text-body">
          Soporte (opcional)
        </label>
        <input
          id="soporte-justificacion"
          type="file"
          accept={TIPOS_SOPORTE}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-body file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
        />
        <p className="mt-1 text-xs text-muted">PDF, JPG, PNG o WEBP, máximo 5 MB (por ejemplo, la incapacidad médica).</p>
      </div>
    </Drawer>
  );
}
