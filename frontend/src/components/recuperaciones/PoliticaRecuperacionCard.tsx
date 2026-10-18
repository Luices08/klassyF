import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import {
  type EfectoRecuperacion,
  type IntegracionRecuperacion,
  type ModoIntegracion,
  type MomentoRecuperacion,
  NOMBRES_EFECTO,
  NOMBRES_MODO_INTEGRACION,
  NOMBRES_MOMENTO,
  type PoliticaRecuperacion,
  useActualizarPoliticaRecuperacion,
  usePoliticaRecuperacion,
} from '../../hooks/useRecuperaciones';
import { usePoliticaPromocion } from '../../hooks/usePromocion';

const EFECTOS = Object.keys(NOMBRES_EFECTO) as EfectoRecuperacion[];
const MOMENTOS = Object.keys(NOMBRES_MOMENTO) as MomentoRecuperacion[];
const MODOS = Object.keys(NOMBRES_MODO_INTEGRACION) as ModoIntegracion[];

/**
 * Política de recuperaciones del año (el SIEE del colegio): qué periodos se recuperan y cuándo, qué pasa con la nota y si hay
 * recuperación de fin de año. La norma no impone nada de esto; cada colegio lo decide. Solo el ADMIN la cambia.
 */
export function PoliticaRecuperacionCard({ academicYearId, puedeEditar }: { academicYearId?: string; puedeEditar: boolean }) {
  const { data, isLoading, isError, error } = usePoliticaRecuperacion(academicYearId);
  if (!academicYearId) return <Alert tone="info">No hay un año lectivo configurado.</Alert>;
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <Formulario key={JSON.stringify(data)} academicYearId={academicYearId} politica={data} puedeEditar={puedeEditar} />;
}

function Formulario({ academicYearId, politica, puedeEditar }: { academicYearId: string; politica: PoliticaRecuperacion; puedeEditar: boolean }) {
  const actualizar = useActualizarPoliticaRecuperacion(academicYearId);
  const [borrador, setBorrador] = useState<PoliticaRecuperacion>(() => structuredClone(politica));
  const [mensaje, setMensaje] = useState<{ tone: 'success' | 'error'; texto: string } | null>(null);
  // Si Promoción ya define la recuperación final, esos tres datos se cambian allá (el servidor rechaza cambiarlos aquí).
  const delegadaAPromocion = usePoliticaPromocion(academicYearId).data?.umbrales?.recuperacion_hasta != null;
  const ultimo = Math.max(...borrador.periodos.map((r) => r.periodo_numero));
  const bloques = borrador.bloques_molde ?? [];
  const integracion = borrador.periodo.integracion;
  const pideBloque = integracion.modo === 'REEMPLAZA_BLOQUE' || integracion.modo === 'CASILLA_ADICIONAL';

  function cambiarIntegracion(cambios: Partial<IntegracionRecuperacion>) {
    setBorrador((b) => ({ ...b, periodo: { ...b.periodo, integracion: { ...b.periodo.integracion, ...cambios } } }));
  }

  function cambiarRegla(numero: number, cambios: Partial<PoliticaRecuperacion['periodos'][number]>) {
    setBorrador((b) => ({ ...b, periodos: b.periodos.map((r) => (r.periodo_numero === numero ? { ...r, ...cambios } : r)) }));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      const { bloques_molde: _bloques, ...politicaAEnviar } = borrador;
      const integracion = { ...politicaAEnviar.periodo.integracion };
      if (integracion.modo !== 'CASILLA_ADICIONAL') {
        integracion.peso = null;
      }
      await actualizar.mutateAsync({
        ...politicaAEnviar,
        periodo: { ...politicaAEnviar.periodo, integracion },
      });
      setMensaje({ tone: 'success', texto: 'Política de recuperaciones actualizada.' });
    } catch (err) {
      setMensaje({ tone: 'error', texto: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={(e) => void guardar(e)} className="space-y-4">
      <Card>
        <CardHeader
          title="Recuperación de periodo"
          subtitle="Decide, periodo por periodo, si se recupera y cuándo. La ventana de fechas se define en «Año lectivo» como evento de recuperación."
        />
        <div className="space-y-4">
          {borrador.periodos.map((regla) => (
            <div key={regla.periodo_numero} className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_1fr]">
              <Switch
                label={`Periodo ${regla.periodo_numero}`}
                description={regla.aplica ? 'Tiene recuperación' : 'No tiene recuperación'}
                checked={regla.aplica}
                disabled={!puedeEditar}
                onChange={(aplica) => cambiarRegla(regla.periodo_numero, { aplica })}
              />
              <Select
                label={`Cuándo se recupera el periodo ${regla.periodo_numero}`}
                hideLabel
                value={regla.momento}
                disabled={!puedeEditar || !regla.aplica}
                onChange={(e) => cambiarRegla(regla.periodo_numero, { momento: e.target.value as MomentoRecuperacion })}
              >
                {MOMENTOS.map((m) => (
                  <option key={m} value={m} disabled={m === 'INICIO_SIGUIENTE_PERIODO' && regla.periodo_numero === ultimo}>
                    {NOMBRES_MOMENTO[m]}
                    {m === 'INICIO_SIGUIENTE_PERIODO' && regla.periodo_numero === ultimo ? ' (no hay periodo siguiente)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Efecto en la nota"
              hint={integracion.modo === 'NOTA_FINAL' ? undefined : 'Solo aplica cuando la recuperación se calcula sobre la nota final.'}
              value={borrador.periodo.efecto}
              disabled={!puedeEditar || integracion.modo !== 'NOTA_FINAL'}
              onChange={(e) => setBorrador((b) => ({ ...b, periodo: { ...b.periodo, efecto: e.target.value as EfectoRecuperacion } }))}
            >
              {EFECTOS.map((x) => (
                <option key={x} value={x}>
                  {NOMBRES_EFECTO[x]}
                </option>
              ))}
            </Select>
            <Input
              label="Intentos por recuperación"
              type="number"
              min={1}
              max={5}
              value={borrador.periodo.max_intentos}
              disabled={!puedeEditar}
              onChange={(e) => setBorrador((b) => ({ ...b, periodo: { ...b.periodo, max_intentos: Number(e.target.value) } }))}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Cómo entra la nota de la recuperación"
          subtitle="Define cómo se junta la recuperación del periodo con las notas que el docente ya cerró. La nota cerrada no se modifica: el boletín usa la resultante."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Modo de integración"
              value={integracion.modo}
              disabled={!puedeEditar}
              onChange={(e) => cambiarIntegracion({ modo: e.target.value as ModoIntegracion })}
            >
              {MODOS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRES_MODO_INTEGRACION[m]}
                </option>
              ))}
            </Select>
            {(pideBloque || integracion.modo === 'REEMPLAZA_NOTA_MAS_BAJA') && (
              <Select
                label={integracion.modo === 'REEMPLAZA_NOTA_MAS_BAJA' ? 'Buscar la nota más baja en' : 'Bloque de la nota'}
                value={integracion.bloque_clave}
                disabled={!puedeEditar}
                onChange={(e) => cambiarIntegracion({ bloque_clave: e.target.value })}
              >
                {integracion.modo === 'REEMPLAZA_NOTA_MAS_BAJA' ? <option value="">Toda la asignatura</option> : <option value="">Elige un bloque…</option>}
                {bloques.map((b) => (
                  <option key={b.clave} value={b.clave}>
                    {b.nombre} ({b.porcentaje}%)
                  </option>
                ))}
              </Select>
            )}
            {integracion.modo === 'CASILLA_ADICIONAL' && (
              <Input
                label="Peso dentro del bloque (%)"
                type="number"
                min={1}
                max={100}
                hint="Vacío = pesa igual que las demás notas del bloque"
                value={integracion.peso ?? ''}
                disabled={!puedeEditar}
                onChange={(e) => cambiarIntegracion({ peso: e.target.value === '' ? null : Number(e.target.value) })}
              />
            )}
          </div>
          {integracion.modo !== 'NOTA_FINAL' && (
            <Switch
              label="Solo si mejora la nota"
              description="Si la recuperación bajaría la nota de la asignatura, se conserva la que tenía."
              checked={integracion.solo_si_mejora}
              disabled={!puedeEditar}
              onChange={(solo_si_mejora) => cambiarIntegracion({ solo_si_mejora })}
            />
          )}
          {integracion.modo !== 'NOTA_FINAL' && (
            <Switch
              label="Limitar a la nota aprobatoria"
              description="La nota resultante no pasa de la nota mínima de aprobado."
              checked={integracion.tope_aprobatoria}
              disabled={!puedeEditar}
              onChange={(tope_aprobatoria) => cambiarIntegracion({ tope_aprobatoria })}
            />
          )}
          <Switch
            label="La nota recuperada cuenta en el boletín"
            description={integracion.cuenta_en_boletin ? 'El boletín y la definitiva del año usan la nota resultante.' : 'La recuperación solo se anota: el boletín y la definitiva del año conservan la nota original.'}
            checked={integracion.cuenta_en_boletin}
            disabled={!puedeEditar}
            onChange={(cuenta_en_boletin) => cambiarIntegracion({ cuenta_en_boletin })}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Recuperación de fin de año" subtitle="Para quien termina el año con una asignatura perdida (definitiva ponderada por los periodos)." />
        <div className="space-y-4">
          {delegadaAPromocion && (
            <Alert tone="info">Si hay recuperación, hasta cuántas asignaturas y qué nota queda se definen en «Promoción y cierre de año». Aquí solo se ven.</Alert>
          )}
          <Switch
            label="El colegio tiene recuperación de fin de año"
            checked={borrador.anual.aplica}
            disabled={!puedeEditar || delegadaAPromocion}
            onChange={(aplica) => setBorrador((b) => ({ ...b, anual: { ...b.anual, aplica } }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Efecto en la nota"
              value={borrador.anual.efecto}
              disabled={!puedeEditar || delegadaAPromocion || !borrador.anual.aplica}
              onChange={(e) => setBorrador((b) => ({ ...b, anual: { ...b.anual, efecto: e.target.value as EfectoRecuperacion } }))}
            >
              {EFECTOS.map((x) => (
                <option key={x} value={x}>
                  {NOMBRES_EFECTO[x]}
                </option>
              ))}
            </Select>
            <Input
              label="Intentos por recuperación"
              type="number"
              min={1}
              max={5}
              value={borrador.anual.max_intentos}
              disabled={!puedeEditar || !borrador.anual.aplica}
              onChange={(e) => setBorrador((b) => ({ ...b, anual: { ...b.anual, max_intentos: Number(e.target.value) } }))}
            />
            <Input
              label="Máximo de asignaturas perdidas"
              type="number"
              min={0}
              max={50}
              hint="0 = sin tope"
              value={borrador.anual.max_asignaturas_pendientes}
              disabled={!puedeEditar || delegadaAPromocion || !borrador.anual.aplica}
              onChange={(e) => setBorrador((b) => ({ ...b, anual: { ...b.anual, max_asignaturas_pendientes: Number(e.target.value) } }))}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Lo que dice el SIEE" subtitle="Texto de referencia para la comunidad: estrategias de apoyo, requisitos y reclamaciones." />
        <Textarea
          label="Texto del SIEE sobre recuperaciones"
          rows={4}
          maxLength={4000}
          value={borrador.texto_siee}
          disabled={!puedeEditar}
          onChange={(e) => setBorrador((b) => ({ ...b, texto_siee: e.target.value }))}
        />
      </Card>

      {mensaje && <Alert tone={mensaje.tone}>{mensaje.texto}</Alert>}
      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="submit" isLoading={actualizar.isPending}>
            Guardar política
          </Button>
        </div>
      )}
    </form>
  );
}
