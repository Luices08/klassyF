import { type FormEvent, useState } from 'react';
import { useActualizarVariableHorario, useCrearVariableHorario, type ContextoHorario } from '../../hooks/useHorarios';
import type { Grade } from '../../types/domain';
import {
  METADATOS_VARIABLE,
  NOMBRES_CATEGORIA_VARIABLE,
  TIPOS_VARIABLE_HORARIO,
  type CatalogoHorario,
  type CategoriaVariableHorario,
  type OrdenConsecutivas,
  type SeveridadVariableHorario,
  type TipoAlcanceHorario,
  type TipoVariableHorario,
  type VariableHorario,
} from '../../types/horarios';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';

interface VariableDrawerProps {
  open: boolean;
  /** null = nueva; con valor = edición (el tipo no cambia). */
  variable: VariableHorario | null;
  contexto: ContextoHorario;
  /** Grados activos del catálogo de la institución (M01): de aquí sale el alcance. */
  grados: Grade[];
  catalogo: CatalogoHorario;
  espacios: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
}

// La disponibilidad tiene su propia pestaña (malla); no se crea desde este formulario.
const TIPOS_DEL_FORMULARIO = TIPOS_VARIABLE_HORARIO.filter((t) => t !== 'DISPONIBILIDAD');
const CATEGORIAS = [...new Set(TIPOS_DEL_FORMULARIO.map((t) => METADATOS_VARIABLE[t].categoria))] as CategoriaVariableHorario[];

const casilla = 'h-4 w-4 rounded border-border text-primary focus:ring-primary';

export function VariableDrawer(props: VariableDrawerProps) {
  if (!props.open) return null;
  return <FormularioVariable {...props} />;
}

function numeroO(valor: unknown, porDefecto: number): number {
  return typeof valor === 'number' ? valor : porDefecto;
}

function FormularioVariable({ variable, contexto, grados, catalogo, espacios, onClose }: VariableDrawerProps) {
  const editando = variable !== null;
  const crear = useCrearVariableHorario();
  const actualizar = useActualizarVariableHorario();
  const mutacion = editando ? actualizar : crear;
  const p = variable?.parametros ?? {};

  const [tipo, setTipo] = useState<TipoVariableHorario>(variable?.tipo ?? 'NO_MISMO_DIA');
  const meta = METADATOS_VARIABLE[tipo];
  const [descripcion, setDescripcion] = useState(variable?.descripcion ?? '');
  const [severidad, setSeveridad] = useState<SeveridadVariableHorario>(variable?.severidad ?? meta.severidadPorDefecto);
  const [peso, setPeso] = useState(variable?.peso ?? 5);
  const [alcance, setAlcance] = useState<TipoAlcanceHorario>(variable?.alcance.tipo ?? 'GLOBAL');
  const [gradeIds, setGradeIds] = useState<string[]>(variable?.alcance.grade_ids ?? []);
  const [asignaturas, setAsignaturas] = useState<string[]>(variable?.asignatura_ids ?? []);
  const [docentes, setDocentes] = useState<string[]>(variable?.docente_ids ?? []);
  const [esExcepcion, setEsExcepcion] = useState(variable?.es_excepcion ?? false);

  // Parámetros (se guardan todos en estado; al enviar se arma solo lo del tipo elegido).
  const [bloques, setBloques] = useState(Array.isArray(p.bloques) ? (p.bloques as number[]).join(', ') : '2, 2');
  const [nombreReunion, setNombreReunion] = useState(typeof p.nombre === 'string' ? p.nombre : '');
  const [duracion, setDuracion] = useState(numeroO(p.duracion, 2));
  const [sesiones, setSesiones] = useState(numeroO(p.sesiones, 1));
  const [descansoSepara, setDescansoSepara] = useState(p.descanso_separa !== false);
  const [maxSesionesDia, setMaxSesionesDia] = useState(typeof p.max_sesiones_dia === 'number' ? String(p.max_sesiones_dia) : '1');
  const [minDias, setMinDias] = useState(typeof p.min_dias_distintos === 'number' ? String(p.min_dias_distintos) : '');
  const [orden, setOrden] = useState<OrdenConsecutivas>((p.orden as OrdenConsecutivas) ?? 'ARBITRARIO');
  const [maximo, setMaximo] = useState(numeroO(p.max ?? p.max_por_dia, tipo.startsWith('MAX_HUECOS') ? 1 : 4));
  const [espacioIds, setEspacioIds] = useState<string[]>(Array.isArray(p.espacio_ids) ? (p.espacio_ids as string[]) : []);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  function cambiarTipo(nuevo: TipoVariableHorario) {
    setTipo(nuevo);
    setSeveridad(METADATOS_VARIABLE[nuevo].severidadPorDefecto);
    if (!METADATOS_VARIABLE[nuevo].usaAlcance) setAlcance('GLOBAL');
    if (METADATOS_VARIABLE[nuevo].asignaturasExactas === 0) setAsignaturas([]);
    if (!METADATOS_VARIABLE[nuevo].usaDocentes) setDocentes([]);
  }

  function armarParametros(): Record<string, unknown> | string {
    switch (tipo) {
      case 'DISTRIBUCION_BLOQUES': {
        const lista = bloques.split(/[,\s]+/).filter(Boolean).map(Number);
        if (lista.length === 0 || lista.some((n) => !Number.isInteger(n) || n < 1)) return 'Escribe los bloques como números enteros separados por comas, ej. 2, 2, 1.';
        return { bloques: lista };
      }
      case 'REUNION_COLECTIVA':
        if (!nombreReunion.trim()) return 'Escribe el nombre de la reunión.';
        return { nombre: nombreReunion.trim(), duracion, sesiones };
      case 'NO_CONSECUTIVAS':
        return { descanso_separa: descansoSepara };
      case 'DISTRIBUCION_SEMANAL': {
        const params: Record<string, number> = {};
        if (maxSesionesDia) params.max_sesiones_dia = Number(maxSesionesDia);
        if (minDias) params.min_dias_distintos = Number(minDias);
        if (Object.keys(params).length === 0) return 'Indica al menos el máximo por día o el mínimo de días.';
        return params;
      }
      case 'CONSECUTIVAS':
        return { orden };
      case 'MAX_HORAS_DIA_GRUPO':
      case 'MAX_HORAS_DIA_DOCENTE':
        return { max: maximo };
      case 'MAX_HUECOS_GRUPO':
      case 'MAX_HUECOS_DOCENTE':
        return { max_por_dia: maximo };
      case 'MAX_CONSECUTIVAS_DOCENTE':
        return { max: maximo, descanso_separa: descansoSepara };
      case 'ESPACIO_REQUERIDO':
        if (espacioIds.length === 0) return 'Elige al menos un espacio.';
        return { espacio_ids: espacioIds };
      default:
        return {};
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    mutacion.reset();
    const parametros = armarParametros();
    if (typeof parametros === 'string') return setErrorLocal(parametros);
    if (alcance === 'GRADOS' && gradeIds.length === 0) return setErrorLocal('Elige al menos un grado o cambia el alcance a todos los grados.');
    if (meta.asignaturasExactas && asignaturas.length !== meta.asignaturasExactas) {
      return setErrorLocal(`Esta condición necesita exactamente ${meta.asignaturasExactas} asignaturas.`);
    }

    const datos = {
      tipo,
      descripcion: descripcion.trim(),
      severidad,
      peso,
      alcance: { tipo: alcance, grade_ids: alcance === 'GRADOS' ? gradeIds : [] },
      asignatura_ids: asignaturas,
      docente_ids: docentes,
      es_excepcion: esExcepcion,
      parametros,
    };
    if (editando) await actualizar.mutateAsync({ id: variable._id, ...datos });
    else await crear.mutateAsync({ ...contexto, ...datos });
    onClose();
  }

  const conParametroMaximo = ['MAX_HORAS_DIA_GRUPO', 'MAX_HORAS_DIA_DOCENTE', 'MAX_HUECOS_GRUPO', 'MAX_HUECOS_DOCENTE', 'MAX_CONSECUTIVAS_DOCENTE'].includes(tipo);

  return (
    <Drawer
      open
      size="lg"
      title={editando ? 'Editar variable' : 'Nueva variable'}
      subtitle="Una regla que el motor respeta (dura) o intenta cumplir (preferencia)."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={editando ? 'Guardar cambios' : 'Crear variable'}
      isSubmitting={mutacion.isPending}
    >
      <div className="space-y-4">
        {(errorLocal || mutacion.isError) && <Alert tone="error">{errorLocal ?? errorMessage(mutacion.error)}</Alert>}

        <Select label="Condición" value={tipo} disabled={editando} onChange={(e) => cambiarTipo(e.target.value as TipoVariableHorario)} hint={meta.ayuda}>
          {CATEGORIAS.map((c) => (
            <optgroup key={c} label={NOMBRES_CATEGORIA_VARIABLE[c]}>
              {TIPOS_DEL_FORMULARIO.filter((t) => METADATOS_VARIABLE[t].categoria === c).map((t) => (
                <option key={t} value={t}>
                  {METADATOS_VARIABLE[t].etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>

        <Input label="Descripción (opcional)" value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para reconocerla en la lista" />

        {meta.usaAlcance && (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-label text-body">Aplica a</legend>
            <div className="flex flex-wrap gap-4">
              {(['GLOBAL', 'GRADOS'] as const).map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-body">
                  <input type="radio" name="alcance" checked={alcance === a} onChange={() => setAlcance(a)} className="h-4 w-4 border-border text-primary focus:ring-primary" />
                  {a === 'GLOBAL' ? 'Todos los grados' : 'Solo algunos grados'}
                </label>
              ))}
            </div>
            {alcance === 'GRADOS' && (
              <MultiSelect
                label="Grados"
                options={grados.map((g) => ({ value: g._id, label: g.nombre }))}
                selected={gradeIds}
                onChange={setGradeIds}
                emptyLabel="Elige uno o varios grados"
              />
            )}
            {grados.length === 0 && alcance === 'GRADOS' && <Alert tone="warning">No hay grados activos en el catálogo. Actívalos en Catálogo de grados.</Alert>}
          </fieldset>
        )}

        {meta.asignaturasExactas !== 0 && (
          <MultiSelect
            label={meta.asignaturasExactas ? `Asignaturas (exactamente ${meta.asignaturasExactas})` : 'Asignaturas'}
            options={catalogo.asignaturas.map((s) => ({ value: s._id, label: s.nombre }))}
            selected={asignaturas}
            onChange={setAsignaturas}
            allLabel="Todas las asignaturas"
            emptyLabel={meta.asignaturasExactas ? 'Elige las asignaturas' : 'Todas las asignaturas'}
          />
        )}

        {meta.usaDocentes && (
          <MultiSelect
            label="Docentes"
            options={catalogo.docentes.map((d) => ({ value: d._id, label: d.nombre }))}
            selected={docentes}
            onChange={setDocentes}
            allLabel="Todos los docentes"
            emptyLabel={tipo === 'REUNION_COLECTIVA' ? 'Elige los docentes' : 'Todos los docentes'}
          />
        )}

        {tipo === 'DISTRIBUCION_BLOQUES' && (
          <Input label="Bloques (horas seguidas)" value={bloques} onChange={(e) => setBloques(e.target.value)} hint="Separados por comas. Ej. 5 horas = 2, 2, 1." />
        )}
        {tipo === 'REUNION_COLECTIVA' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Nombre" value={nombreReunion} onChange={(e) => setNombreReunion(e.target.value)} placeholder="Reunión de Matemáticas" />
            <Input label="Horas seguidas" type="number" min={1} max={12} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} />
            <Input label="Veces por semana" type="number" min={1} max={10} value={sesiones} onChange={(e) => setSesiones(Number(e.target.value))} />
          </div>
        )}
        {tipo === 'DISTRIBUCION_SEMANAL' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Máximo de sesiones por día" type="number" min={1} value={maxSesionesDia} onChange={(e) => setMaxSesionesDia(e.target.value)} />
            <Input label="Mínimo de días distintos" type="number" min={1} max={7} value={minDias} onChange={(e) => setMinDias(e.target.value)} hint="Vacío = sin mínimo" />
          </div>
        )}
        {tipo === 'CONSECUTIVAS' && (
          <Select label="Orden" value={orden} onChange={(e) => setOrden(e.target.value as OrdenConsecutivas)}>
            <option value="ARBITRARIO">Cualquier orden</option>
            <option value="ESPECIFICADO">La primera asignatura antes que la segunda</option>
          </Select>
        )}
        {conParametroMaximo && (
          <Input
            label={tipo.startsWith('MAX_HUECOS') ? 'Máximo de horas libres por día' : tipo === 'MAX_CONSECUTIVAS_DOCENTE' ? 'Máximo de horas seguidas' : 'Máximo de horas por día'}
            type="number"
            min={tipo.startsWith('MAX_HUECOS') ? 0 : 1}
            value={maximo}
            onChange={(e) => setMaximo(Number(e.target.value))}
          />
        )}
        {(tipo === 'NO_CONSECUTIVAS' || tipo === 'MAX_CONSECUTIVAS_DOCENTE') && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={descansoSepara} onChange={(e) => setDescansoSepara(e.target.checked)} className={casilla} />
            El descanso las separa (antes y después del descanso no cuentan como seguidas)
          </label>
        )}
        {tipo === 'ESPACIO_REQUERIDO' && (
          <MultiSelect label="Espacios" options={espacios.map((e) => ({ value: e._id, label: e.nombre }))} selected={espacioIds} onChange={setEspacioIds} emptyLabel="Elige los espacios" />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de regla"
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value as SeveridadVariableHorario)}
            hint={severidad === 'DURA' ? 'Si se incumple, el horario no se puede publicar.' : 'Se cumple si se puede; la importancia decide cuál ceder primero.'}
          >
            <option value="DURA">Obligatoria</option>
            <option value="BLANDA">Preferencia</option>
          </Select>
          {severidad === 'BLANDA' && (
            <Input label="Importancia (1 a 10)" type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(Number(e.target.value))} />
          )}
        </div>

        {tipo !== 'REUNION_COLECTIVA' && (
          <label className="flex items-start gap-2 text-sm text-body">
            <input type="checkbox" checked={esExcepcion} onChange={(e) => setEsExcepcion(e.target.checked)} className={`mt-0.5 ${casilla}`} />
            <span>
              Es una excepción
              <span className="block text-xs text-muted">Anula, para lo que elegiste aquí, las reglas de esta misma condición más generales. Ej. "no el mismo día" para todos, excepto 11°.</span>
            </span>
          </label>
        )}
      </div>
    </Drawer>
  );
}
