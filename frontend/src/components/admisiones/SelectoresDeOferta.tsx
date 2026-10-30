import { Alert } from '../ui/Alert';
import { Select } from '../ui/Field';
import { ETIQUETA_JORNADA } from '../../hooks/useCertificados';
import { useOfertaDeAdmision } from '../../hooks/useAdmissionRequests';
import type { Jornada } from '../../types/domain';

export interface PedidoDeCupo {
  grado_deseado_id: string;
  sede_deseada_id: string;
  jornada_deseada: Jornada | '';
}

/**
 * Grado, sede y jornada que pide una solicitud de cupo, limitados a lo que el colegio ofrece (grupos activos del año elegido): cada lista solo trae
 * lo que existe junto con lo ya elegido, así nadie radica un grado en una sede o jornada donde no hay. Sede y jornada son opcionales («sin preferencia»).
 * El servidor vuelve a comprobarlo al radicar.
 */
export function SelectoresDeOferta({ valor, onChange, anioId }: { valor: PedidoDeCupo; onChange: (cambios: Partial<PedidoDeCupo>) => void; anioId?: string }) {
  const { data, isLoading } = useOfertaDeAdmision(anioId);
  const oferta = data?.oferta ?? [];

  const coincide = (o: (typeof oferta)[number], sin: keyof PedidoDeCupo) =>
    (sin === 'grado_deseado_id' || !valor.grado_deseado_id || o.grado.id === valor.grado_deseado_id) &&
    (sin === 'sede_deseada_id' || !valor.sede_deseada_id || o.sede.id === valor.sede_deseada_id) &&
    (sin === 'jornada_deseada' || !valor.jornada_deseada || o.jornada === valor.jornada_deseada);

  // Son listas cortas: se calculan en cada dibujo, sin memorizar.
  const grados = [...new Map(oferta.filter((o) => coincide(o, 'grado_deseado_id')).map((o) => [o.grado.id, o.grado])).values()].sort((a, b) => a.numero - b.numero);
  const sedes = [...new Map(oferta.filter((o) => coincide(o, 'sede_deseada_id')).map((o) => [o.sede.id, o.sede])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const jornadas = [...new Set(oferta.filter((o) => coincide(o, 'jornada_deseada')).map((o) => o.jornada))];

  return (
    <>
      {!isLoading && oferta.length === 0 && <Alert tone="warning">El colegio aún no tiene grupos abiertos para recibir solicitudes. Intenta más adelante.</Alert>}
      <Select label="Grado deseado" required value={valor.grado_deseado_id} onChange={(e) => onChange({ grado_deseado_id: e.target.value })} disabled={isLoading}>
        <option value="">Selecciona...</option>
        {grados.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
      </Select>
      <Select label="Sede deseada (opcional)" value={valor.sede_deseada_id} onChange={(e) => onChange({ sede_deseada_id: e.target.value })} disabled={isLoading}>
        <option value="">Sin preferencia</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Select>
      <Select label="Jornada deseada (opcional)" value={valor.jornada_deseada} onChange={(e) => onChange({ jornada_deseada: e.target.value as Jornada | '' })} disabled={isLoading}>
        <option value="">Sin preferencia</option>
        {jornadas.map((j) => (
          <option key={j} value={j}>
            {ETIQUETA_JORNADA[j] ?? j}
          </option>
        ))}
      </Select>
    </>
  );
}
