import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { XIcon } from '../ui/icons';
import { NOMBRES_ROL_INVOLUCRADO, ROLES_INVOLUCRADO, useAbrirCaso, type RolInvolucrado } from '../../hooks/useCasos';
import {
  TIPOS_SITUACION,
  useEstudiantesObservables,
  type SolicitudEnBandeja,
  type TipoSituacion,
} from '../../hooks/useObservaciones';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface Involucrado {
  student_id: string;
  nombre: string;
  rol: RolInvolucrado;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si viene, el caso convierte la solicitud pendiente de esa observación. */
  solicitud?: SolicitudEnBandeja | null;
  onAbierto?: (casoId: string) => void;
}

export function AbrirCasoDrawer(props: Props) {
  if (!props.open) return null;
  return <Formulario {...props} />;
}

function Formulario({ onClose, solicitud, onAbierto }: Props) {
  const abrir = useAbrirCaso();
  const [tipo, setTipo] = useState<TipoSituacion>(solicitud?.tipo_situacion_maxima ?? 'I');
  const [fecha, setFecha] = useState(solicitud ? solicitud.fecha_hecho.slice(0, 10) : hoyLocal());
  const [lugar, setLugar] = useState('');
  const [hechos, setHechos] = useState(solicitud?.texto_generado ?? '');
  const [comoSeConocio, setComoSeConocio] = useState('');
  const [involucrados, setInvolucrados] = useState<Involucrado[]>(
    solicitud ? [{ student_id: solicitud.student_id, nombre: solicitud.estudiante, rol: 'PRESUNTO_RESPONSABLE' }] : []
  );
  const [busqueda, setBusqueda] = useState('');
  const resultados = useEstudiantesObservables({ q: busqueda });

  const agregar = (id: string, nombre: string) => {
    if (involucrados.some((i) => i.student_id === id)) return;
    setInvolucrados((previa) => [...previa, { student_id: id, nombre, rol: 'PRESUNTO_RESPONSABLE' }]);
    setBusqueda('');
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const caso = await abrir.mutateAsync({
      tipo_situacion: tipo,
      fecha_hecho: fecha,
      lugar,
      hechos,
      como_se_conocio: comoSeConocio,
      involucrados: involucrados.map(({ student_id, rol }) => ({ student_id, rol })),
      observacion_id: solicitud?._id,
    });
    onAbierto?.(caso._id);
    onClose();
  };

  return (
    <Drawer
      open
      size="lg"
      title="Abrir caso de convivencia"
      subtitle={solicitud ? `A partir de la solicitud de ${solicitud.estudiante}` : 'Apertura directa (denuncia, reporte o tercero)'}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Abrir caso"
      isSubmitting={abrir.isPending}
      submitDisabled={hechos.trim().length < 10 || involucrados.length === 0}
    >
      {abrir.isError && <Alert tone="error">{errorMessage(abrir.error)}</Alert>}
      <Alert tone="info">
        El tipo lo decides tú como coordinador de convivencia. Se asigna un consecutivo anual y se copian los pasos del protocolo de ese tipo.
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="Tipo de situación" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSituacion)}>
          {TIPOS_SITUACION.map((t) => (
            <option key={t} value={t}>
              Tipo {t}
            </option>
          ))}
        </Select>
        <Input label="Fecha del hecho" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        <Input label="Lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={200} />
      </div>

      <Textarea label="Hechos" rows={5} maxLength={4000} value={hechos} onChange={(e) => setHechos(e.target.value)} hint="Describe lo ocurrido en neutro: se habla de presuntos hechos y de presuntos responsables." />
      <Input label="Cómo se conoció" value={comoSeConocio} onChange={(e) => setComoSeConocio(e.target.value)} maxLength={300} placeholder="Denuncia de un estudiante, reporte de un docente…" />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-label text-body">Estudiantes involucrados</legend>
        {involucrados.map((i) => (
          <div key={i.student_id} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-body">{i.nombre}</span>
            <Select
              label={`Rol de ${i.nombre}`}
              hideLabel
              value={i.rol}
              onChange={(e) => setInvolucrados((previa) => previa.map((x) => (x.student_id === i.student_id ? { ...x, rol: e.target.value as RolInvolucrado } : x)))}
            >
              {ROLES_INVOLUCRADO.map((r) => (
                <option key={r} value={r}>
                  {NOMBRES_ROL_INVOLUCRADO[r]}
                </option>
              ))}
            </Select>
            <IconButton tone="danger" label="Quitar" icon={<XIcon />} onClick={() => setInvolucrados((previa) => previa.filter((x) => x.student_id !== i.student_id))} type="button" />
          </div>
        ))}
        <Input label="Agregar estudiante" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o documento (mínimo 3 letras)" />
        {(resultados.data ?? []).length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {(resultados.data ?? []).map((s) => (
              <li key={s.student_id}>
                <Button type="button" variant="secondary" className="w-full justify-start rounded-none border-0 text-left text-sm" onClick={() => agregar(s.student_id, `${s.apellido} ${s.nombre}`)}>
                  {s.apellido} {s.nombre} · {s.numero_documento} · {s.grupo}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </Drawer>
  );
}
