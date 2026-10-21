import type { useFiltrosDashboard } from '../../hooks/useFiltrosDashboard';
import { Select } from '../ui/Field';

/** `sinPeriodo` es para los paneles que no miran periodos (convivencia y orientación): solo año y sede. */
export function BarraFiltrosDashboard({ f, sinPeriodo = false }: { f: ReturnType<typeof useFiltrosDashboard>; sinPeriodo?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${sinPeriodo ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
      <Select
        label="Año lectivo"
        value={f.anio?._id ?? ''}
        onChange={(e) => {
          f.setAnioId(e.target.value);
          f.setPeriodo('');
        }}
      >
        {f.anios.map((a) => (
          <option key={a._id} value={a._id}>
            {a.year} · {a.nombre}
          </option>
        ))}
      </Select>
      <Select label="Sede" value={f.sedeId} onChange={(e) => f.setSedeId(e.target.value)}>
        <option value="">Todas las sedes</option>
        {f.sedes.map((s) => (
          <option key={s._id} value={s._id}>
            {s.nombre}
          </option>
        ))}
      </Select>
      {!sinPeriodo && (
        <Select label="Periodo" value={f.periodo} onChange={(e) => f.setPeriodo(e.target.value)}>
          <option value="">El que corresponde a cada indicador</option>
          {(f.anio?.periodos ?? []).map((p) => (
            <option key={p.numero} value={p.numero}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
