import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { PanelDocumentosPdf } from '../ui/PanelDocumentosPdf';
import { AlertasCalendario } from './AlertasCalendario';
import {
  type Actividad,
  type ActividadConResumen,
  type DatosActividad,
  useActualizarActividad,
  useCrearActividad,
  useRevisionCalendario,
} from '../../hooks/useActividades';
import { useBloquesDeClase } from '../../hooks/useNotas';
import { cargarArchivoPlanAula } from '../../hooks/usePlanesAula';
import {
  FORMATOS_EVIDENCIA,
  type FormatoEvidencia,
  NOMBRES_TIPO_ACTIVIDAD,
  TIPOS_ACTIVIDAD,
  type TipoActividad,
  aInputInstante,
  aInstante,
} from '../../lib/actividades';
import type { ResumenPlanAula } from '../../types/domain';

interface ActividadDrawerProps {
  open: boolean;
  onClose: () => void;
  teacherAssignmentId: string;
  periodoNumero: number;
  /** El plan de aula APROBADO de esta clase y periodo (M07): se lee al lado mientras se programa la actividad. */
  planAula: ResumenPlanAula | null;
  /** Con actividad se edita; sin ella se crea. */
  actividad: ActividadConResumen | null;
}

interface Formulario {
  tipo: TipoActividad;
  titulo: string;
  descripcion: string;
  componente: string;
  peso: string;
  apertura: string;
  entrega: string;
  requiere: boolean;
  formatos: FormatoEvidencia[];
  tardia: boolean;
  confirmar: boolean;
}

function formularioInicial(actividad: Actividad | null): Formulario {
  if (actividad) {
    return {
      tipo: actividad.tipo,
      titulo: actividad.titulo,
      descripcion: actividad.descripcion,
      componente: actividad.componente_siee,
      peso: actividad.peso_en_componente === null ? '' : String(actividad.peso_en_componente),
      apertura: aInputInstante(actividad.fecha_apertura),
      entrega: aInputInstante(actividad.fecha_entrega),
      requiere: actividad.requiere_entrega,
      formatos: actividad.formatos_permitidos,
      tardia: actividad.permite_entrega_tardia,
      confirmar: false,
    };
  }
  return {
    tipo: 'TAREA',
    titulo: '',
    descripcion: '',
    componente: '',
    peso: '',
    apertura: aInputInstante(new Date().toISOString()),
    entrega: '',
    requiere: true,
    formatos: ['PDF'],
    tardia: false,
    confirmar: false,
  };
}

/** CU-DOC-02: formulario para programar (o editar) una tarea, evaluación, trabajo o proyecto. */
export function ActividadDrawer(props: ActividadDrawerProps) {
  // Cada actividad abre su propio formulario: el estado inicial se calcula una vez por apertura.
  return props.open ? <FormularioActividad key={props.actividad?._id ?? 'nueva'} {...props} /> : null;
}

function FormularioActividad({ onClose, teacherAssignmentId, periodoNumero, planAula, actividad }: ActividadDrawerProps) {
  const [f, setF] = useState<Formulario>(() => formularioInicial(actividad));
  // Los bloques del molde del colegio con lo que ya tienen en esta clase y periodo: solo se ofrecen los que aún tienen lugar.
  const bloques = useBloquesDeClase({ teacherAssignmentId, periodoNumero });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const crear = useCrearActividad();
  const actualizar = useActualizarActividad();
  const guardando = crear.isPending || actualizar.isPending;

  const cambiar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => setF((prev) => ({ ...prev, [campo]: valor }));

  const fechaEntrega = f.entrega ? aInstante(f.entrega) : null;
  const fechaCambia = !actividad || fechaEntrega !== actividad.fecha_entrega;
  const revision = useRevisionCalendario(
    fechaEntrega
      ? {
          teacher_assignment_id: teacherAssignmentId,
          periodo_numero: periodoNumero,
          fecha_entrega: fechaEntrega,
          tipo: f.tipo,
          excluir_id: actividad?._id,
          exigir_futuro: f.requiere && fechaCambia,
        }
      : null
  );
  const alertas = revision.data?.alertas ?? [];
  const hayBloqueo = alertas.some((a) => a.severidad === 'BLOQUEO');
  const hayAdvertencia = alertas.some((a) => a.severidad === 'ADVERTENCIA');

  const peso = f.peso.trim() === '' ? null : Number(f.peso);
  const bloqueElegido = f.componente !== '' ? f.componente : (bloques.data?.find((b) => b.casillas.length < b.max_casillas)?.clave ?? '');
  const completo =
    f.titulo.trim() !== '' &&
    f.descripcion.trim() !== '' &&
    bloqueElegido !== '' &&
    f.entrega !== '' &&
    f.apertura !== '' &&
    (peso === null || (Number.isFinite(peso) && peso >= 0 && peso <= 100));

  const toggleFormato = (clave: FormatoEvidencia) =>
    cambiar('formatos', f.formatos.includes(clave) ? f.formatos.filter((x) => x !== clave) : [...f.formatos, clave]);

  const datos = (): DatosActividad => ({
    titulo: f.titulo.trim(),
    descripcion: f.descripcion.trim(),
    tipo: f.tipo,
    componente_siee: bloqueElegido,
    peso_en_componente: peso,
    fecha_apertura: aInstante(f.apertura),
    fecha_entrega: aInstante(f.entrega),
    requiere_entrega: f.requiere,
    formatos_permitidos: f.requiere ? f.formatos : [],
    permite_entrega_tardia: f.requiere && f.tardia,
    confirmar_alertas: f.confirmar,
  });

  /** Al editar solo viaja lo que cambió: así corregir un título no reabre validaciones de lo que no se tocó. */
  const cambios = (completos: DatosActividad, original: Actividad): Partial<DatosActividad> => {
    const actuales: Partial<DatosActividad> = { ...completos };
    const iguales: Array<keyof DatosActividad> = [];
    if (completos.titulo === original.titulo) iguales.push('titulo');
    if (completos.descripcion === original.descripcion) iguales.push('descripcion');
    if (completos.tipo === original.tipo) iguales.push('tipo');
    if (completos.componente_siee === original.componente_siee) iguales.push('componente_siee');
    if (completos.peso_en_componente === original.peso_en_componente) iguales.push('peso_en_componente');
    if (completos.fecha_apertura === original.fecha_apertura) iguales.push('fecha_apertura');
    if (completos.fecha_entrega === original.fecha_entrega) iguales.push('fecha_entrega');
    if (completos.requiere_entrega === original.requiere_entrega) iguales.push('requiere_entrega');
    if (completos.permite_entrega_tardia === original.permite_entrega_tardia) iguales.push('permite_entrega_tardia');
    if (JSON.stringify(completos.formatos_permitidos) === JSON.stringify(original.formatos_permitidos)) iguales.push('formatos_permitidos');
    for (const campo of iguales) delete actuales[campo];
    return actuales;
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      if (actividad) {
        await actualizar.mutateAsync({ id: actividad._id, ...cambios(datos(), actividad), confirmar_alertas: f.confirmar });
      } else {
        await crear.mutateAsync({ teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero, ...datos() });
      }
      onClose();
    } catch (error) {
      setMensaje(errorMessage(error));
    }
  }

  return (
    <Drawer
      open
      size="xl"
      title={actividad ? 'Editar actividad' : 'Nueva actividad'}
      subtitle={`Periodo ${periodoNumero}. Estudiantes y calendario se resuelven por tu asignación.`}
      onClose={onClose}
      onSubmit={(e) => void guardar(e)}
      submitLabel={actividad ? 'Guardar cambios' : 'Programar actividad'}
      isSubmitting={guardando}
      submitDisabled={!completo || hayBloqueo || (hayAdvertencia && !f.confirmar)}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {mensaje && <Alert tone="error">{mensaje}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select label="Tipo" value={f.tipo} onChange={(e) => cambiar('tipo', e.target.value as TipoActividad)}>
              {TIPOS_ACTIVIDAD.map((t) => (
                <option key={t} value={t}>
                  {NOMBRES_TIPO_ACTIVIDAD[t]}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input label="Título" value={f.titulo} maxLength={150} onChange={(e) => cambiar('titulo', e.target.value)} />
            </div>
          </div>

          <Textarea
            label="Instrucciones"
            rows={4}
            value={f.descripcion}
            maxLength={5000}
            hint="Lo que el estudiante debe hacer y cómo se evalúa."
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Bloque de la planilla"
              value={bloqueElegido}
              disabled={bloques.isLoading}
              error={bloques.isError ? errorMessage(bloques.error) : undefined}
              hint="El colegio define los bloques y cuántas casillas admite cada uno."
              onChange={(e) => cambiar('componente', e.target.value)}
            >
              {/* Una actividad antigua puede apuntar a un bloque que el año ya no ofrece: se conserva visible. */}
              {actividad && !bloques.data?.some((b) => b.clave === actividad.componente_siee) && (
                <option value={actividad.componente_siee}>{actividad.componente_nombre}</option>
              )}
              {(bloques.data ?? []).map((b) => {
                const lleno = b.casillas.length >= b.max_casillas && b.clave !== actividad?.componente_siee;
                return (
                  <option key={b.clave} value={b.clave} disabled={lleno}>
                    {b.nombre} ({b.porcentaje}%) · {b.casillas.length}/{b.max_casillas} casillas{lleno ? ' · lleno' : ''}
                  </option>
                );
              })}
            </Select>
            <Input
              label="Peso dentro del bloque (%)"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={f.peso}
              hint="Opcional. Vacío: las casillas sin peso se reparten en partes iguales lo que queda del bloque."
              onChange={(e) => cambiar('peso', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Se publica (hora de Colombia)"
              type="datetime-local"
              value={f.apertura}
              onChange={(e) => cambiar('apertura', e.target.value)}
            />
            <Input
              label="Límite de entrega (hora de Colombia)"
              type="datetime-local"
              value={f.entrega}
              min={f.apertura || undefined}
              onChange={(e) => {
                cambiar('entrega', e.target.value);
                cambiar('confirmar', false);
              }}
            />
          </div>

          {fechaEntrega && <AlertasCalendario revision={revision.data} cargando={revision.isFetching} error={revision.error} />}
          {hayAdvertencia && !hayBloqueo && (
            <label className="flex items-start gap-2 text-sm text-body">
              <input type="checkbox" className="mt-0.5" checked={f.confirmar} onChange={(e) => cambiar('confirmar', e.target.checked)} />
              Entiendo las advertencias y quiero programar la actividad en esta fecha.
            </label>
          )}

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-label text-body">Recepción de entregas</legend>
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={f.requiere}
                disabled={Boolean(actividad) && actividad?.requiere_entrega === true && (actividad.resumen?.entregadas ?? 0) > 0}
                onChange={(e) => cambiar('requiere', e.target.checked)}
              />
              Los estudiantes entregan algo en la plataforma
            </label>
            {f.requiere ? (
              <>
                <div>
                  <p className="mb-1.5 text-label text-body">Formatos que se aceptan</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {FORMATOS_EVIDENCIA.map((formato) => (
                      <label key={formato.clave} className="flex items-center gap-2 text-sm text-body">
                        <input type="checkbox" checked={f.formatos.includes(formato.clave)} onChange={() => toggleFormato(formato.clave)} />
                        {formato.etiqueta}
                      </label>
                    ))}
                  </div>
                  {f.formatos.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted">Sin formatos marcados, el estudiante responde escribiendo en la plataforma.</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-body">
                  <input type="checkbox" checked={f.tardia} onChange={(e) => cambiar('tardia', e.target.checked)} />
                  Acepta entregas tardías (quedan marcadas «Entregada con retraso»)
                </label>
              </>
            ) : (
              <p className="text-xs text-muted">Actividad de aula: no recibe archivos. La calificas directamente.</p>
            )}
          </fieldset>
        </div>

        <PanelDocumentosPdf
          documentos={
            planAula
              ? [
                  {
                    clave: `plan-aula-${planAula._id}-${planAula.version_actual}`,
                    titulo: `Tu plan de aula aprobado: ${planAula.titulo}`,
                    nombreArchivo: planAula.archivo_nombre,
                    cargar: () => cargarArchivoPlanAula(planAula._id, planAula.version_actual),
                  },
                ]
              : []
          }
          vacio="Aquí verás el plan de aula aprobado de este periodo."
        />
      </div>
    </Drawer>
  );
}
