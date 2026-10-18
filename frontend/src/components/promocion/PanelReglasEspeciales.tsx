import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { Switch } from '../ui/Switch';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import {
  type AccionRegla,
  type CondicionRegla,
  type MomentoPromocion,
  NOMBRES_ACCION,
  NOMBRES_CONDICION,
  NOMBRES_MOMENTO_PROMOCION,
  type PoliticaPromocion,
  type ReglaPromocion,
  type TipoCondicion,
} from '../../hooks/usePromocion';
import { NIVELES_EDUCATIVOS } from '../../types/domain';

const ACCIONES = Object.keys(NOMBRES_ACCION) as AccionRegla[];
const ACCIONES_PERMITIDAS_CONVIVENCIA: AccionRegla[] = ['ENVIA_A_COMISION', 'NO_RENUEVA_CUPO'];
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

/** Una condición nueva con lo mínimo que su tipo necesita para ser válida. */
interface Props {
  open: boolean;
  onClose: () => void;
  valor: PoliticaPromocion;
  onChange: (p: PoliticaPromocion) => void;
  puedeEditar: boolean;
}

/** Reglas propias del colegio, solo para condiciones que las tres tarjetas no cubren. Las de umbrales e inasistencia ya se aplican solas. */
export function PanelReglasEspeciales({ open, onClose, valor: b, onChange, puedeEditar }: Props) {
  const areas = useAreas().data ?? [];
  const asignaturas = useSubjects().data ?? [];
  const opcionesAreas = areas.map((a) => ({ value: a._id, label: a.nombre }));
  const opcionesAsignaturas = asignaturas.map((s) => ({ value: s._id, label: s.nombre }));
  const bloqueado = !puedeEditar;
  const setB = (nuevo: PoliticaPromocion) => onChange(nuevo);
  const cambiarRegla = (i: number, cambios: Partial<ReglaPromocion>) => onChange({ ...b, reglas: b.reglas.map((r, k) => (k === i ? { ...r, ...cambios } : r)) });
  const cambiarCondicion = (i: number, j: number, cambios: Partial<CondicionRegla>) =>
    cambiarRegla(i, { condiciones: b.reglas[i]!.condiciones.map((c, k) => (k === j ? { ...c, ...cambios } : c)) });
  const num = (v: string): number | null => (v === '' ? null : Number(v));

  return (
    <Drawer open={open} title="Reglas especiales del colegio" subtitle="Solo si tu SIEE tiene condiciones que no aparecen en las tarjetas." onClose={onClose} size="xl">
      {puedeEditar && <div className="flex justify-end"><Button type="button" variant="soft-edit" onClick={() => setB({ ...b, reglas: [...b.reglas, { clave: claveNueva(), nombre: 'Nueva regla', activa: true, momentos: ['CIERRE', 'TRAS_RECUPERACION'], niveles: [], grados_ids: [], condiciones: [condicionNueva('PERDIDAS_AL_MENOS')], accion: 'NO_PROMUEVE' }] })}>
                  Agregar regla personalizada
                </Button></div>}
        {b.reglas.length === 0 && <p className="text-sm text-muted">Sin reglas personalizadas.</p>}
        <div className="space-y-4">
          {b.reglas.map((r, i) => {
            const tieneConvivencia = r.condiciones.some((c) => c.tipo === 'FALTAS_CONVIVENCIA_AL_MENOS');
            return (
              <div key={r.clave} className="space-y-3 rounded-lg border border-border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input label="Nombre de la regla" value={r.nombre} maxLength={120} disabled={bloqueado} onChange={(e) => cambiarRegla(i, { nombre: e.target.value })} />
                  <Select label="Acción resultante" value={r.accion} disabled={bloqueado} onChange={(e) => cambiarRegla(i, { accion: e.target.value as AccionRegla })}>
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
                  <p className="text-label text-body">Condiciones (todas deben cumplirse para activar la regla)</p>
                  {r.condiciones.map((c, j) => (
                    <div key={j} className="grid grid-cols-1 items-end gap-3 rounded-lg bg-soft p-3 sm:grid-cols-4">
                      <Select label="Condición" value={c.tipo} disabled={bloqueado} onChange={(e) => cambiarCondicion(i, j, condicionNueva(e.target.value as TipoCondicion))}>
                        <optgroup label="── Rendimiento Académico ──">
                          <option value="PERDIDAS_AL_MENOS">{NOMBRES_CONDICION.PERDIDAS_AL_MENOS}</option>
                          <option value="PERDIDAS_COMO_MAXIMO">{NOMBRES_CONDICION.PERDIDAS_COMO_MAXIMO}</option>
                          <option value="PIERDE_ASIGNATURAS">{NOMBRES_CONDICION.PIERDE_ASIGNATURAS}</option>
                          <option value="PIERDE_AREAS">{NOMBRES_CONDICION.PIERDE_AREAS}</option>
                          <option value="PROMEDIO_GENERAL_MENOR">{NOMBRES_CONDICION.PROMEDIO_GENERAL_MENOR}</option>
                        </optgroup>
                        <optgroup label="── Asistencia / Ausentismo ──">
                          <option value="INASISTENCIA_GLOBAL_SUPERA">{NOMBRES_CONDICION.INASISTENCIA_GLOBAL_SUPERA}</option>
                          <option value="INASISTENCIA_ASIGNATURA_SUPERA">{NOMBRES_CONDICION.INASISTENCIA_ASIGNATURA_SUPERA}</option>
                        </optgroup>
                        <optgroup label="── Otras Condiciones ──">
                          <option value="RECUPERACION_NO_SUPERADA_AL_MENOS">{NOMBRES_CONDICION.RECUPERACION_NO_SUPERADA_AL_MENOS}</option>
                          <option value="SIN_NOTA_AL_MENOS">{NOMBRES_CONDICION.SIN_NOTA_AL_MENOS}</option>
                          <option value="FALTAS_CONVIVENCIA_AL_MENOS">{NOMBRES_CONDICION.FALTAS_CONVIVENCIA_AL_MENOS}</option>
                          <option value="TIENE_PIAR">{NOMBRES_CONDICION.TIENE_PIAR}</option>
                        </optgroup>
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
    </Drawer>
  );
}
