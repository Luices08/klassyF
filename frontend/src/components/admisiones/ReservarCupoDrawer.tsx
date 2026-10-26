import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { useCuposPrematricula, useReservarCupo } from '../../hooks/useAdmissionRequests';
import { useCampuses, useJornadas } from '../../hooks/useCatalogs';
import { useInstitution } from '../../hooks/useInstitution';
import type { AdmissionRequest } from '../../types/domain';

const idDe = (v: string | { _id: string } | null | undefined): string => (v ? (typeof v === 'string' ? v : v._id) : '');

interface Resultado {
  aviso: string | null;
  posicion: number | null;
}

/**
 * Reservar cupo a una solicitud (prematrícula): en qué grado (el que pidió), sede y jornada. No crea grupo, cuenta ni matrícula: aparta el lugar. Si no
 * cabe, la solicitud queda en lista de espera por orden de inscripción y el aviso dice por qué. Se monta con `key` por solicitud para empezar limpio.
 */
export function ReservarCupoDrawer({ solicitud, onClose }: { solicitud: AdmissionRequest | null; onClose: () => void }) {
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const reservar = useReservarCupo();

  const [sedeId, setSedeId] = useState(idDe(solicitud?.sede_deseada_id));
  const [jornadaId, setJornadaId] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const jornadas = useJornadas(sedeId || undefined);
  const cupos = useCuposPrematricula(solicitud?.academic_year_id ?? undefined);

  const gradoId = idDe(solicitud?.grado_deseado_id);
  const nombreGrado = solicitud && typeof solicitud.grado_deseado_id !== 'string' ? solicitud.grado_deseado_id.nombre : 'el grado pedido';
  const fila = cupos.data?.filas.find((f) => f.grado.id === gradoId && f.sede.id === sedeId && f.jornada.id === jornadaId);
  const eligio = Boolean(sedeId && jornadaId);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!solicitud) return;
    reservar.reset();
    const r = await reservar.mutateAsync({ id: solicitud._id, sede_id: sedeId, jornada_id: jornadaId });
    setResultado({ aviso: r.aviso, posicion: r.posicion_espera });
  }

  return (
    <Drawer
      open={solicitud !== null}
      title={resultado ? (resultado.aviso ? 'En lista de espera' : 'Cupo reservado') : 'Reservar cupo'}
      subtitle={solicitud ? `${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante} · ${nombreGrado}` : undefined}
      onClose={onClose}
      onSubmit={resultado ? undefined : enviar}
      submitLabel="Reservar cupo"
      isSubmitting={reservar.isPending}
      submitDisabled={!eligio}
    >
      {resultado ? (
        <div className="space-y-4">
          {resultado.aviso ? (
            <Alert tone="warning">
              Quedó en lista de espera{resultado.posicion ? ` (posición ${resultado.posicion})` : ''}. {resultado.aviso}
            </Alert>
          ) : (
            <Alert tone="success">El cupo quedó reservado. No se creó la matrícula: se hace cuando la familia se presente, desde «Nueva matrícula».</Alert>
          )}
          <Button onClick={onClose}>Listo</Button>
        </div>
      ) : (
        <>
          {reservar.isError && <Alert tone="error">{errorMessage(reservar.error)}</Alert>}
          <Alert tone="info">
            El cupo se aparta por grado, sede y jornada, sin elegir grupo: el grupo se decide al matricular. Si no cabe, la solicitud espera su turno por orden de inscripción.
          </Alert>
          <Select
            label="Sede"
            required
            value={sedeId}
            onChange={(e) => {
              setSedeId(e.target.value);
              setJornadaId('');
            }}
          >
            <option value="">Selecciona…</option>
            {(sedes.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <Select label="Jornada" required value={jornadaId} onChange={(e) => setJornadaId(e.target.value)} disabled={!sedeId}>
            <option value="">{sedeId ? 'Selecciona…' : 'Elige primero la sede'}</option>
            {(jornadas.data ?? []).map((j) => (
              <option key={j._id} value={j._id}>
                {j.nombre}
              </option>
            ))}
          </Select>

          {eligio && cupos.data && !fila && (
            <Alert tone="warning">El año {cupos.data.anio.year} no tiene grupos de {nombreGrado} en esa sede y jornada: créalos en «Grupos» antes de reservar.</Alert>
          )}
          {eligio && fila && (
            <p className="rounded-lg bg-soft px-3 py-2 text-sm text-body">
              Cupos libres: <span className="font-semibold text-ink">{fila.libres}</span> de {fila.capacidad} ({fila.ocupados} matriculados o preinscritos, {fila.reservados} reservados
              {fila.en_espera > 0 ? `, ${fila.en_espera} en espera` : ''}).
              {fila.libres <= 0 || fila.en_espera > 0 ? ' Esta solicitud quedaría en lista de espera.' : ''}
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
