import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import {
  CERRABLES,
  NOMBRES_ESTADO_CASO,
  NOMBRES_NOTIFICACION,
  NOMBRES_RESULTADO,
  RESULTADOS_CIERRE,
  SIGUIENTES_ESTADOS,
  TIPOS_NOTIFICACION,
  useAgregarRegistroCaso,
  useAnularCaso,
  useCambiarEstadoCaso,
  useCatalogosCaso,
  useCerrarCaso,
  NOMBRES_ROL_INVOLUCRADO,
  useDeclararImpedimento,
  useRemitirAOrientacion,
  useReabrirCaso,
  useReclasificarCaso,
  useRegistrarAtencion,
  useRegistrarDecision,
  type CasoDetalle,
  type ColeccionRegistro,
  type EstadoCaso,
  type ResultadoCierre,
  type TipoNotificacion,
} from '../../hooks/useCasos';
import {
  MEDIOS_CITACION,
  NOMBRES_MEDIO,
  TIPOS_SITUACION,
  useCatalogoConvivencia,
  type MedioCitacion,
  type TipoSituacion,
} from '../../hooks/useObservaciones';

export type ModoAccionCaso =
  | 'estado'
  | 'tipo'
  | 'atencion'
  | 'decision'
  | 'cierre'
  | 'reapertura'
  | 'anulacion'
  | 'impedimento'
  | 'orientacion'
  | ColeccionRegistro;

const TITULOS: Record<ModoAccionCaso, string> = {
  estado: 'Cambiar el estado del caso',
  tipo: 'Cambiar el tipo de situación',
  atencion: 'Atención inmediata',
  decision: 'Decisión motivada',
  cierre: 'Cerrar el caso',
  reapertura: 'Reabrir el caso',
  anulacion: 'Anular el caso',
  impedimento: 'Declararme impedido',
  orientacion: 'Remitir a orientación',
  seguimientos: 'Registrar seguimiento',
  notificaciones: 'Registrar notificación',
  descargos: 'Registrar descargos',
  'medidas-proteccion': 'Registrar medida de protección',
  remisiones: 'Registrar remisión',
  'medidas-aplicadas': 'Registrar medida aplicada',
};

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface Props {
  caso: CasoDetalle;
  modo: ModoAccionCaso | null;
  esAdmin: boolean;
  onClose: () => void;
}

export function AccionesCasoDrawer(props: Props) {
  if (!props.modo) return null;
  return <Formulario {...props} modo={props.modo} />;
}

function Formulario({ caso, modo, esAdmin, onClose }: Props & { modo: ModoAccionCaso }) {
  const cambiarEstado = useCambiarEstadoCaso();
  const reclasificar = useReclasificarCaso();
  const atencion = useRegistrarAtencion();
  const decision = useRegistrarDecision();
  const cerrar = useCerrarCaso();
  const reabrir = useReabrirCaso();
  const anular = useAnularCaso();
  const impedimento = useDeclararImpedimento();
  const remitirOrientacion = useRemitirAOrientacion();
  const registro = useAgregarRegistroCaso();
  const catalogos = useCatalogosCaso();
  const catalogoFaltas = useCatalogoConvivencia();

  const [estado, setEstado] = useState<EstadoCaso>(SIGUIENTES_ESTADOS[caso.estado][0] ?? 'EN_ATENCION');
  const [tipo, setTipo] = useState<TipoSituacion>(TIPOS_SITUACION.find((t) => t !== caso.tipo_situacion) ?? 'II');
  const [resultado, setResultado] = useState<ResultadoCierre>('SOLUCIONADO');
  const [texto, setTexto] = useState('');
  const [textoExtra, setTextoExtra] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [proxima, setProxima] = useState('');
  const [medio, setMedio] = useState<MedioCitacion>('LLAMADA');
  const [tipoNotificacion, setTipoNotificacion] = useState<TipoNotificacion>('ACUDIENTES');
  const [parte, setParte] = useState<'ESTUDIANTE' | 'ACUDIENTE'>('ESTUDIANTE');
  const [estudianteId, setEstudianteId] = useState(caso.involucrados[0]?.student_id ?? '');
  const [entidadId, setEntidadId] = useState('');
  const [medidaId, setMedidaId] = useState('');
  const [dias, setDias] = useState('');
  const [huboDano, setHuboDano] = useState(false);
  const [faltas, setFaltas] = useState<Set<string>>(new Set());
  const [aRemitir, setARemitir] = useState<Set<string>>(new Set());

  const mutation = { estado: cambiarEstado, tipo: reclasificar, atencion, decision, cierre: cerrar, reapertura: reabrir, anulacion: anular, impedimento, orientacion: remitirOrientacion }[modo as string] ?? registro;
  const medida = catalogos.data?.medidas.find((m) => m._id === medidaId);

  const tiposDisponibles = TIPOS_SITUACION.filter((t) => t !== caso.tipo_situacion && (esAdmin || TIPOS_SITUACION.indexOf(t) > TIPOS_SITUACION.indexOf(caso.tipo_situacion)));
  const faltasDelManual = catalogoFaltas.data?.faltas ?? [];
  const sinRemision = caso.remisiones.length === 0;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const id = caso._id;
    switch (modo) {
      case 'estado':
        await cambiarEstado.mutateAsync({ id, estado });
        break;
      case 'tipo':
        await reclasificar.mutateAsync({ id, tipo_situacion: tipo, motivo: texto });
        break;
      case 'atencion':
        await atencion.mutateAsync({ id, descripcion: texto, hubo_dano: huboDano });
        break;
      case 'decision':
        await decision.mutateAsync({ id, motivacion: texto, faltas_ids: [...faltas] });
        break;
      case 'cierre':
        await cerrar.mutateAsync({ id, resultado, motivo: texto, justificacion_sin_remision: textoExtra || undefined });
        break;
      case 'reapertura':
        await reabrir.mutateAsync({ id, motivo: texto });
        break;
      case 'anulacion':
        await anular.mutateAsync({ id, motivo: texto });
        break;
      case 'impedimento':
        await impedimento.mutateAsync({ id, motivo: texto });
        break;
      case 'orientacion':
        await remitirOrientacion.mutateAsync({ id, student_ids: [...aRemitir], motivo: texto });
        break;
      case 'seguimientos':
        await registro.mutateAsync({ id, coleccion: modo, fecha, nota: texto, proxima_fecha: proxima || null });
        break;
      case 'notificaciones':
        await registro.mutateAsync({ id, coleccion: modo, fecha, tipo: tipoNotificacion, medio, dirigida_a: textoExtra, resultado: texto });
        break;
      case 'descargos':
        await registro.mutateAsync({ id, coleccion: modo, fecha, parte, student_id: parte === 'ESTUDIANTE' ? estudianteId : undefined, texto });
        break;
      case 'medidas-proteccion':
        await registro.mutateAsync({ id, coleccion: modo, fecha, descripcion: texto });
        break;
      case 'remisiones':
        await registro.mutateAsync({ id, coleccion: modo, fecha, entidad_id: entidadId, oficio: textoExtra, respuesta: texto });
        break;
      case 'medidas-aplicadas':
        await registro.mutateAsync({ id, coleccion: modo, fecha, medida_id: medidaId, dias: medida?.se_aplica_por_dias ? Number(dias) : undefined, observaciones: texto });
        break;
    }
    onClose();
  };

  const requiereFecha = ['seguimientos', 'notificaciones', 'descargos', 'medidas-proteccion', 'remisiones', 'medidas-aplicadas'].includes(modo);
  // El texto es obligatorio salvo en el estado, y en las notificaciones, remisiones y medidas aplicadas, donde es el resultado u observaciones.
  const TEXTO_OPCIONAL: ModoAccionCaso[] = ['estado', 'notificaciones', 'remisiones', 'medidas-aplicadas'];
  const textoMinimo = TEXTO_OPCIONAL.includes(modo) ? 0 : modo === 'decision' ? 20 : modo === 'seguimientos' ? 3 : 5;
  const deshabilitar =
    texto.trim().length < textoMinimo ||
    (modo === 'remisiones' && !entidadId) ||
    (modo === 'medidas-aplicadas' && (!medidaId || (medida?.se_aplica_por_dias && !(Number(dias) > 0)))) ||
    (modo === 'tipo' && tiposDisponibles.length === 0) ||
    (modo === 'orientacion' && aRemitir.size === 0);

  return (
    <Drawer
      open
      size="lg"
      title={TITULOS[modo]}
      subtitle={caso.codigo}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={modo === 'reapertura' ? 'Reabrir' : modo === 'anulacion' ? 'Anular caso' : modo === 'cierre' ? 'Cerrar caso' : 'Guardar'}
      submitVariant={modo === 'anulacion' || modo === 'cierre' ? 'soft-danger' : 'primary'}
      isSubmitting={mutation.isPending}
      submitDisabled={Boolean(deshabilitar)}
    >
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}

      {modo === 'orientacion' && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-label text-body">Estudiantes que se remiten</legend>
          {caso.involucrados.map((i) => (
            <label key={i.student_id} className="flex cursor-pointer items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={aRemitir.has(i.student_id)}
                onChange={() =>
                  setARemitir((previa) => {
                    const siguiente = new Set(previa);
                    if (siguiente.has(i.student_id)) siguiente.delete(i.student_id);
                    else siguiente.add(i.student_id);
                    return siguiente;
                  })
                }
              />
              {i.estudiante} · {NOMBRES_ROL_INVOLUCRADO[i.rol]}
            </label>
          ))}
        </fieldset>
      )}

      {modo === 'estado' && (
        <Select label="Nuevo estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCaso)}>
          {SIGUIENTES_ESTADOS[caso.estado].map((s) => (
            <option key={s} value={s}>
              {NOMBRES_ESTADO_CASO[s]}
            </option>
          ))}
        </Select>
      )}

      {modo === 'tipo' && (
        <>
          {!esAdmin && <Alert tone="info">Solo se puede subir de tipo. Bajarlo lo hace un administrador.</Alert>}
          <Select label="Nuevo tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSituacion)}>
            {tiposDisponibles.map((t) => (
              <option key={t} value={t}>
                Tipo {t}
              </option>
            ))}
          </Select>
        </>
      )}

      {modo === 'cierre' && (
        <>
          {CERRABLES.includes(caso.estado) ? null : <Alert tone="warning">Un caso {NOMBRES_ESTADO_CASO[caso.estado].toLowerCase()} no se puede cerrar todavía.</Alert>}
          <Select label="Resultado" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoCierre)}>
            {RESULTADOS_CIERRE.map((r) => (
              <option key={r} value={r}>
                {NOMBRES_RESULTADO[r]}
              </option>
            ))}
          </Select>
          {caso.tipo_situacion === 'III' && sinRemision && (
            <Textarea label="Justificación de la falta de remisión" rows={2} maxLength={1000} value={textoExtra} onChange={(e) => setTextoExtra(e.target.value)} hint="Un caso tipo III exige remisión o explicar por qué no la hubo." />
          )}
        </>
      )}

      {modo === 'atencion' && (
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={huboDano} onChange={(e) => setHuboDano(e.target.checked)} />
          Hubo daño al cuerpo o a la salud
        </label>
      )}

      {requiereFecha && <Input label="Fecha" type="date" max={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} required />}

      {modo === 'seguimientos' && <Input label="Próximo seguimiento (opcional)" type="date" min={fecha} value={proxima} onChange={(e) => setProxima(e.target.value)} />}

      {modo === 'notificaciones' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Qué se notificó" value={tipoNotificacion} onChange={(e) => setTipoNotificacion(e.target.value as TipoNotificacion)}>
            {TIPOS_NOTIFICACION.map((t) => (
              <option key={t} value={t}>
                {NOMBRES_NOTIFICACION[t]}
              </option>
            ))}
          </Select>
          <Select label="Medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioCitacion)}>
            {MEDIOS_CITACION.map((m) => (
              <option key={m} value={m}>
                {NOMBRES_MEDIO[m]}
              </option>
            ))}
          </Select>
          <Input label="Dirigida a" value={textoExtra} onChange={(e) => setTextoExtra(e.target.value)} maxLength={120} />
        </div>
      )}

      {modo === 'descargos' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Quién presenta" value={parte} onChange={(e) => setParte(e.target.value as 'ESTUDIANTE' | 'ACUDIENTE')}>
            <option value="ESTUDIANTE">Estudiante</option>
            <option value="ACUDIENTE">Acudiente</option>
          </Select>
          {parte === 'ESTUDIANTE' && (
            <Select label="Estudiante" value={estudianteId} onChange={(e) => setEstudianteId(e.target.value)}>
              {caso.involucrados.map((i) => (
                <option key={`${i.student_id}${i.rol}`} value={i.student_id}>
                  {i.estudiante}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {modo === 'remisiones' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Entidad" value={entidadId} onChange={(e) => setEntidadId(e.target.value)} required>
            <option value="">Elige una entidad</option>
            {(catalogos.data?.entidades ?? []).map((en) => (
              <option key={en._id} value={en._id}>
                {en.nombre}
              </option>
            ))}
          </Select>
          <Input label="Número de oficio" value={textoExtra} onChange={(e) => setTextoExtra(e.target.value)} maxLength={120} />
        </div>
      )}

      {modo === 'medidas-aplicadas' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Medida" value={medidaId} onChange={(e) => setMedidaId(e.target.value)} required>
            <option value="">Elige una medida</option>
            {(catalogos.data?.medidas ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {m.nombre}
              </option>
            ))}
          </Select>
          {medida?.se_aplica_por_dias && <Input label="Días" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} required />}
        </div>
      )}

      {modo === 'decision' && faltasDelManual.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-label text-body">Faltas del manual en que se funda (opcional)</legend>
          {faltasDelManual.map((d) => (
            <label key={d._id} className="flex cursor-pointer items-start gap-2 text-sm text-body">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                checked={faltas.has(d._id)}
                onChange={() =>
                  setFaltas((previa) => {
                    const siguiente = new Set(previa);
                    if (siguiente.has(d._id)) siguiente.delete(d._id);
                    else siguiente.add(d._id);
                    return siguiente;
                  })
                }
              />
              <span>
                {d.codigo} · Tipo {d.gravedad} · {d.descripcion}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {modo !== 'estado' && (
        <Textarea
          label={etiquetaTexto(modo)}
          rows={modo === 'decision' ? 6 : 4}
          maxLength={modo === 'decision' ? 4000 : 2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          hint={modo === 'decision' ? 'Mínimo 20 caracteres. Debe estar motivada y salir de lo conocido en los descargos.' : undefined}
        />
      )}
    </Drawer>
  );
}

function etiquetaTexto(modo: ModoAccionCaso): string {
  switch (modo) {
    case 'atencion':
      return 'Descripción de la atención';
    case 'decision':
      return 'Motivación de la decisión';
    case 'seguimientos':
      return 'Nota de seguimiento';
    case 'notificaciones':
      return 'Resultado';
    case 'descargos':
      return 'Descargos';
    case 'medidas-proteccion':
      return 'Medida de protección';
    case 'remisiones':
      return 'Respuesta o estado de la remisión';
    case 'medidas-aplicadas':
      return 'Observaciones';
    default:
      return 'Motivo';
  }
}
