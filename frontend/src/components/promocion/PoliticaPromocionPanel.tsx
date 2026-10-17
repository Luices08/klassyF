import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import {
  type AccionRegla,
  type AccionSinRegla,
  type CondicionArrastre,
  type CondicionRegla,
  type ConsecuenciaArrastre,
  type MomentoPromocion,
  NOMBRES_ACCION,
  NOMBRES_CONDICION,
  NOMBRES_CONDICION_ARRASTRE,
  NOMBRES_CONSECUENCIA_ARRASTRE,
  NOMBRES_MOMENTO_PROMOCION,
  type PoliticaPromocion,
  type ReglaPromocion,
  type TipoCondicion,
  useActualizarPoliticaPromocion,
  usePoliticaPromocion,
} from '../../hooks/usePromocion';
import { NIVELES_EDUCATIVOS } from '../../types/domain';

const ACCIONES = Object.keys(NOMBRES_ACCION) as AccionRegla[];
const ACCIONES_SIN_REGLA: AccionSinRegla[] = ['PENDIENTE_RECUPERACION', 'NO_PROMUEVE', 'ENVIA_A_COMISION'];
const ACCIONES_PERMITIDAS_CONVIVENCIA: AccionRegla[] = ['ENVIA_A_COMISION', 'NO_RENUEVA_CUPO'];
const TIPOS = Object.keys(NOMBRES_CONDICION) as TipoCondicion[];
const MOMENTOS = Object.keys(NOMBRES_MOMENTO_PROMOCION) as MomentoPromocion[];
const REQUIERE_N: TipoCondicion[] = ['PERDIDAS_AL_MENOS', 'PERDIDAS_COMO_MAXIMO', 'SIN_NOTA_AL_MENOS', 'RECUPERACION_NO_SUPERADA_AL_MENOS', 'FALTAS_CONVIVENCIA_AL_MENOS'];
const USA_FILTRO: TipoCondicion[] = ['PERDIDAS_AL_MENOS', 'PERDIDAS_COMO_MAXIMO'];
const USA_PORCENTAJE: TipoCondicion[] = ['INASISTENCIA_GLOBAL_SUPERA', 'INASISTENCIA_ASIGNATURA_SUPERA'];

/** Una condición nueva con lo mínimo que su tipo necesita para ser válida. */
function condicionNueva(tipo: TipoCondicion): CondicionRegla {
  return {
    tipo,
    n: REQUIERE_N.includes(tipo) ? 1 : null,
    porcentaje: USA_PORCENTAJE.includes(tipo) ? 20 : null,
    nota: tipo === 'PROMEDIO_GENERAL_MENOR' ? 3 : null,
    filtro: USA_FILTRO.includes(tipo) ? 'TODAS' : null,
    faltas: USA_PORCENTAJE.includes(tipo) ? 'SOLO_INJUSTIFICADAS' : null,
    modo: tipo === 'PIERDE_ASIGNATURAS' || tipo === 'PIERDE_AREAS' ? 'ALGUNA' : null,
    subject_ids: [],
    area_ids: [],
    gravedad: tipo === 'FALTAS_CONVIVENCIA_AL_MENOS' ? 'II' : null,
  };
}

const claveNueva = () => `regla-${Date.now().toString(36)}`;

/**
 * La política de promoción del año (M19): el SIEE del colegio hecho datos. Qué se cuenta como perdido, qué reglas disparan qué acción,
 * qué se hace con quien no cae en ninguna, el arrastre y los requisitos de titulación. Solo el ADMIN la cambia; la lee cualquiera con sesión.
 * Las faltas de convivencia nunca pueden reprobar: el servidor solo admite «enviar a comisión» o «no renovar el cupo» en esas reglas.
 */
export function PoliticaPromocionPanel({ academicYearId, puedeEditar }: { academicYearId?: string; puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = usePoliticaPromocion(academicYearId);
  if (!academicYearId) return <Alert tone="info">No hay un año lectivo configurado.</Alert>;
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Formulario key={JSON.stringify(data)} academicYearId={academicYearId} politica={data} puedeEditar={puedeEditar} />;
}

function Formulario({ academicYearId, politica, puedeEditar }: { academicYearId: string; politica: PoliticaPromocion; puedeEditar: boolean }) {
  const actualizar = useActualizarPoliticaPromocion(academicYearId);
  const [b, setB] = useState<PoliticaPromocion>(() => structuredClone(politica));
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  const areas = useAreas().data ?? [];
  const asignaturas = useSubjects().data ?? [];
  const opcionesAreas = areas.map((a) => ({ value: a._id, label: a.nombre }));
  const opcionesAsignaturas = asignaturas.map((s) => ({ value: s._id, label: s.nombre }));
  const bloqueado = !puedeEditar;

  const cambiarRegla = (i: number, cambios: Partial<ReglaPromocion>) => setB((p) => ({ ...p, reglas: p.reglas.map((r, k) => (k === i ? { ...r, ...cambios } : r)) }));
  const cambiarCondicion = (i: number, j: number, cambios: Partial<CondicionRegla>) =>
    cambiarRegla(i, { condiciones: b.reglas[i]!.condiciones.map((c, k) => (k === j ? { ...c, ...cambios } : c)) });
  const num = (v: string): number | null => (v === '' ? null : Number(v));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await actualizar.mutateAsync(b);
      setMensaje({ tone: 'success', texto: 'Política guardada.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={(e) => void guardar(e)} className="space-y-4">
      {!puedeEditar && <Alert tone="info">Esta es la política de promoción del colegio (su SIEE). Solo el administrador puede cambiarla{' '}y no en un año cerrado.</Alert>}
      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}

      <Card>
        <CardHeader
          title="Qué se cuenta como perdido"
          subtitle="Cada colegio decide si promueve por asignatura o por área (la nota del área sale de los pesos del plan de estudios)."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Unidad de promoción"
            value={b.unidad}
            disabled={bloqueado}
            onChange={(e) => setB({ ...b, unidad: e.target.value as PoliticaPromocion['unidad'] })}
          >
            <option value="ASIGNATURA">Por Asignatura (cada materia cuenta independiente)</option>
            <option value="AREA">Por Área (se promedian las asignaturas del área)</option>
          </Select>

          {b.unidad === 'AREA' && (
            <Switch
              label="Perder una asignatura del área la da por perdida"
              description="Aunque la nota del área, por sus pesos, apruebe."
              checked={b.area_pierde_con_asignatura_perdida}
              disabled={bloqueado}
              onChange={(v) => setB({ ...b, area_pierde_con_asignatura_perdida: v })}
            />
          )}

          {b.unidad === 'ASIGNATURA' ? (
            <>
              <MultiSelect
                label="Asignaturas críticas (fundamentales)"
                options={opcionesAsignaturas}
                selected={b.asignaturas_criticas_ids}
                onChange={(v) => !bloqueado && setB({ ...b, asignaturas_criticas_ids: v })}
                allLabel="Ninguna"
              />
              <MultiSelect
                label="Asignaturas permitidas como pendientes"
                options={opcionesAsignaturas}
                selected={b.asignaturas_arrastrables_ids}
                onChange={(v) => !bloqueado && setB({ ...b, asignaturas_arrastrables_ids: v })}
                allLabel="Ninguna"
              />
            </>
          ) : (
            <>
              <MultiSelect
                label="Áreas críticas (fundamentales)"
                options={opcionesAreas}
                selected={b.areas_criticas_ids}
                onChange={(v) => !bloqueado && setB({ ...b, areas_criticas_ids: v })}
                allLabel="Ninguna"
              />
              <MultiSelect
                label="Áreas permitidas como pendientes"
                options={opcionesAreas}
                selected={b.areas_arrastrables_ids}
                onChange={(v) => !bloqueado && setB({ ...b, areas_arrastrables_ids: v })}
                allLabel="Ninguna"
              />
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Reglas"
          subtitle="Cada regla se cumple cuando se dan todas sus condiciones. Si varias se disparan a la vez gana la más severa (retiro, no promover, comisión, recuperación)."
          action={
            puedeEditar && (
              <Button type="button" variant="soft-edit" onClick={() => setB({ ...b, reglas: [...b.reglas, { clave: claveNueva(), nombre: 'Nueva regla', activa: true, momentos: ['CIERRE', 'TRAS_RECUPERACION'], niveles: [], grados_ids: [], condiciones: [condicionNueva('PERDIDAS_AL_MENOS')], accion: 'NO_PROMUEVE' }] })}>
                Agregar regla
              </Button>
            )
          }
        />
        {b.reglas.length === 0 && <p className="text-sm text-muted">Sin reglas: todos los casos se resuelven con la acción «sin regla» de abajo.</p>}
        <div className="space-y-4">
          {b.reglas.map((r, i) => {
            const tieneConvivencia = r.condiciones.some((c) => c.tipo === 'FALTAS_CONVIVENCIA_AL_MENOS');
            return (
              <div key={r.clave} className="space-y-3 rounded-lg border border-border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input label="Nombre" value={r.nombre} maxLength={120} disabled={bloqueado} onChange={(e) => cambiarRegla(i, { nombre: e.target.value })} />
                  <Select label="Qué ordena" value={r.accion} disabled={bloqueado} onChange={(e) => cambiarRegla(i, { accion: e.target.value as AccionRegla })}>
                    {ACCIONES.filter((a) => !tieneConvivencia || ACCIONES_PERMITIDAS_CONVIVENCIA.includes(a)).map((a) => (
                      <option key={a} value={a}>
                        {NOMBRES_ACCION[a]}
                      </option>
                    ))}
                  </Select>
                  <Switch label="Activa" checked={r.activa} disabled={bloqueado} onChange={(v) => cambiarRegla(i, { activa: v })} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MultiSelect<MomentoPromocion> label="Cuándo se evalúa" options={MOMENTOS.map((m) => ({ value: m, label: NOMBRES_MOMENTO_PROMOCION[m] }))} selected={r.momentos} onChange={(v) => !bloqueado && cambiarRegla(i, { momentos: v })} emptyLabel="Elige al menos uno" />
                  <MultiSelect label="Niveles (vacío = todos)" options={NIVELES_EDUCATIVOS.map((n) => ({ value: n, label: n.charAt(0) + n.slice(1).toLowerCase() }))} selected={r.niveles} onChange={(v) => !bloqueado && cambiarRegla(i, { niveles: v })} allLabel="Todos los niveles" />
                </div>
                <div className="space-y-2">
                  <p className="text-label text-body">Condiciones (todas deben cumplirse)</p>
                  {r.condiciones.map((c, j) => (
                    <div key={j} className="grid grid-cols-1 items-end gap-3 rounded-lg bg-soft p-3 sm:grid-cols-4">
                      <Select label="Condición" value={c.tipo} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, condicionNueva(e.target.value as TipoCondicion))}>
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>
                            {NOMBRES_CONDICION[t]}
                          </option>
                        ))}
                      </Select>
                      {REQUIERE_N.includes(c.tipo) && <Input label="N" type="number" min={0} value={c.n ?? ''} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { n: num(e.target.value) })} />}
                      {USA_PORCENTAJE.includes(c.tipo) && <Input label="Porcentaje" type="number" min={0} max={100} value={c.porcentaje ?? ''} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { porcentaje: num(e.target.value) })} />}
                      {c.tipo === 'PROMEDIO_GENERAL_MENOR' && <Input label="Nota" type="number" step="any" min={0} value={c.nota ?? ''} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { nota: num(e.target.value) })} />}
                      {USA_FILTRO.includes(c.tipo) && (
                        <Select label="Cuáles" value={c.filtro ?? 'TODAS'} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { filtro: e.target.value as CondicionRegla['filtro'] })}>
                          <option value="TODAS">Todas</option>
                          <option value="CRITICAS">Solo las críticas</option>
                          <option value="NO_CRITICAS">Solo las no críticas</option>
                        </Select>
                      )}
                      {USA_PORCENTAJE.includes(c.tipo) && (
                        <Select label="Faltas" value={c.faltas ?? 'SOLO_INJUSTIFICADAS'} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { faltas: e.target.value as CondicionRegla['faltas'] })}>
                          <option value="SOLO_INJUSTIFICADAS">Solo injustificadas</option>
                          <option value="TODAS">Todas</option>
                        </Select>
                      )}
                      {c.tipo === 'FALTAS_CONVIVENCIA_AL_MENOS' && (
                        <Select label="Desde la gravedad" value={c.gravedad ?? 'I'} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { gravedad: e.target.value })}>
                          <option value="I">Tipo I</option>
                          <option value="II">Tipo II</option>
                          <option value="III">Tipo III</option>
                        </Select>
                      )}
                      {(c.tipo === 'PIERDE_ASIGNATURAS' || c.tipo === 'PIERDE_AREAS') && (
                        <>
                          <Select label="Basta con" value={c.modo ?? 'ALGUNA'} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, { modo: e.target.value as CondicionRegla['modo'] })}>
                            <option value="ALGUNA">Perder alguna de la lista</option>
                            <option value="TODAS">Perder todas a la vez</option>
                          </Select>
                          {c.tipo === 'PIERDE_ASIGNATURAS' ? (
                            <MultiSelect label="Asignaturas" options={opcionesAsignaturas} selected={c.subject_ids ?? []} onChange={(v) => !bloqueado && cambiarCondicion(i, j, { subject_ids: v })} allLabel="Ninguna" />
                          ) : (
                            <MultiSelect label="Áreas" options={opcionesAreas} selected={c.area_ids ?? []} onChange={(v) => !bloqueado && cambiarCondicion(i, j, { area_ids: v })} allLabel="Ninguna" />
                          )}
                        </>
                      )}
                      {puedeEditar && r.condiciones.length > 1 && (
                        <Button type="button" variant="soft-danger" onClick={() => cambiarRegla(i, { condiciones: r.condiciones.filter((_, k) => k !== j) })}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  ))}
                  {puedeEditar && r.condiciones.length < 8 && (
                    <Button type="button" variant="secondary" onClick={() => cambiarRegla(i, { condiciones: [...r.condiciones, condicionNueva('PERDIDAS_AL_MENOS')] })}>
                      Agregar condición
                    </Button>
                  )}
                  {tieneConvivencia && <p className="text-xs text-muted">Las faltas de convivencia nunca reprueban el año: esta regla solo puede enviar a la comisión o no renovar el cupo.</p>}
                </div>
                {puedeEditar && (
                  <Button type="button" variant="soft-danger" onClick={() => setB({ ...b, reglas: b.reglas.filter((_, k) => k !== i) })}>
                    Quitar la regla
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Quien no cae en ninguna regla" subtitle="Qué pasa con el estudiante que pierde algo pero no dispara ninguna regla." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Al cierre del año" value={b.sin_regla.cierre} disabled={bloqueado} onChange={(e) => setB({ ...b, sin_regla: { ...b.sin_regla, cierre: e.target.value as AccionSinRegla } })}>
            {ACCIONES_SIN_REGLA.map((a) => (
              <option key={a} value={a}>
                {NOMBRES_ACCION[a]}
              </option>
            ))}
          </Select>
          <Select label="Tras la recuperación final" value={b.sin_regla.tras_recuperacion} disabled={bloqueado} onChange={(e) => setB({ ...b, sin_regla: { ...b.sin_regla, tras_recuperacion: e.target.value as AccionSinRegla } })}>
            {ACCIONES_SIN_REGLA.map((a) => (
              <option key={a} value={a}>
                {NOMBRES_ACCION[a]}
              </option>
            ))}
          </Select>
          <Switch label="Enviar a la comisión al estudiante con PIAR" description="Solo se sabe que tiene uno vigente, nunca su categoría." checked={b.piar.derivar_a_comision} disabled={bloqueado} onChange={(v) => setB({ ...b, piar: { derivar_a_comision: v } })} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Promoción con materias pendientes (Promoción condicionada)"
          subtitle="Permite que un estudiante pase al grado siguiente debiendo asignaturas (o áreas), con un compromiso de nivelación durante el año siguiente."
        />
        <div className="space-y-4">
          <Switch
            label={b.unidad === 'ASIGNATURA' ? 'El colegio admite pasar con asignaturas pendientes' : 'El colegio admite pasar con áreas pendientes'}
            checked={b.arrastre.admite}
            disabled={bloqueado}
            onChange={(v) => setB({ ...b, arrastre: { ...b.arrastre, admite: v } })}
          />
          {b.arrastre.admite && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label={b.unidad === 'ASIGNATURA' ? 'Cuántas asignaturas se pueden deber' : 'Cuántas áreas se pueden deber'}
                type="number"
                min={1}
                max={20}
                value={b.arrastre.max_unidades}
                disabled={bloqueado}
                onChange={(e) => setB({ ...b, arrastre: { ...b.arrastre, max_unidades: Number(e.target.value) } })}
              />
              <Select
                label="Condición para nivelar"
                value={b.arrastre.condicion}
                disabled={bloqueado}
                onChange={(e) => setB({ ...b, arrastre: { ...b.arrastre, condicion: e.target.value as CondicionArrastre } })}
              >
                {(Object.keys(NOMBRES_CONDICION_ARRASTRE) as CondicionArrastre[]).map((c) => (
                  <option key={c} value={c}>
                    {NOMBRES_CONDICION_ARRASTRE[c]}
                  </option>
                ))}
              </Select>
              {b.arrastre.condicion === 'NOTA_MINIMA_PRIMER_PERIODO' && (
                <Input
                  label="Nota mínima requerida"
                  type="number"
                  step="any"
                  min={0}
                  value={b.arrastre.nota_minima ?? ''}
                  disabled={bloqueado}
                  onChange={(e) => setB({ ...b, arrastre: { ...b.arrastre, nota_minima: num(e.target.value) } })}
                />
              )}
              <Input
                label="Plazo límite (hasta qué periodo)"
                type="number"
                min={1}
                max={12}
                value={b.arrastre.hasta_periodo}
                disabled={bloqueado}
                onChange={(e) => setB({ ...b, arrastre: { ...b.arrastre, hasta_periodo: Number(e.target.value) } })}
              />
              <Select
                label="Consecuencia si no se nivela"
                value={b.arrastre.si_incumple}
                disabled={bloqueado}
                onChange={(e) => setB({ ...b, arrastre: { ...b.arrastre, si_incumple: e.target.value as ConsecuenciaArrastre } })}
              >
                {(Object.keys(NOMBRES_CONSECUENCIA_ARRASTRE) as ConsecuenciaArrastre[]).map((c) => (
                  <option key={c} value={c}>
                    {NOMBRES_CONSECUENCIA_ARRASTRE[c]}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Requisitos de titulación" subtitle="La norma fija mínimos (p. ej. 80 horas de servicio social); el colegio puede exigir más. Bloquean solo en el grado de titulación." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Grado en que se otorga el título" type="number" min={1} max={11} value={b.titulacion.grado_titulacion} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, grado_titulacion: Number(e.target.value) } })} />
          <div />
          <Switch label="Servicio social obligatorio" checked={b.titulacion.servicio_social.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, activo: v } } })} />
          {b.titulacion.servicio_social.activo && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Horas requeridas" type="number" min={1} value={b.titulacion.servicio_social.horas_requeridas} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, horas_requeridas: Number(e.target.value) } } })} />
              <Input label="Avisar desde el grado" type="number" min={-2} max={11} value={b.titulacion.servicio_social.alerta_desde_grado} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, servicio_social: { ...b.titulacion.servicio_social, alerta_desde_grado: Number(e.target.value) } } })} />
            </div>
          )}
          <Switch label="Haber presentado Saber 11" checked={b.titulacion.saber_11.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, saber_11: { activo: v } } })} />
          <Switch label="Paz y salvo confirmado" checked={b.titulacion.paz_y_salvo.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, paz_y_salvo: { activo: v } } })} />
          <Switch label="Carpeta académica completa" description="Certificados de los grados anteriores." checked={b.titulacion.carpeta_academica.activo} disabled={bloqueado} onChange={(v) => setB({ ...b, titulacion: { ...b.titulacion, carpeta_academica: { ...b.titulacion.carpeta_academica, activo: v } } })} />
          {b.titulacion.carpeta_academica.activo && (
            <Input label="Desde el grado" type="number" min={-2} max={10} value={b.titulacion.carpeta_academica.desde_grado} disabled={bloqueado} onChange={(e) => setB({ ...b, titulacion: { ...b.titulacion, carpeta_academica: { ...b.titulacion.carpeta_academica, desde_grado: Number(e.target.value) } } })} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Texto del SIEE" subtitle="Lo que dice el sistema institucional de evaluación sobre la promoción, para consulta de la comunidad." />
        <Textarea label="Texto" rows={5} maxLength={4000} value={b.texto_siee} disabled={bloqueado} onChange={(e) => setB({ ...b, texto_siee: e.target.value })} />
      </Card>

      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="submit" isLoading={actualizar.isPending}>
            Guardar la política
          </Button>
        </div>
      )}
    </form>
  );
}
