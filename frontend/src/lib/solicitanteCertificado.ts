import type { FichaEstudiante, SolicitanteEntrada } from '../hooks/useCertificados';

/** Lo que el servidor exige a cada tipo de solicitante; la pantalla solo evita enviar algo que seguro rechaza. */
export function solicitanteCompleto(s: SolicitanteEntrada | null): boolean {
  if (!s) return false;
  const largo = (v: string | undefined) => (v ?? '').trim().length;
  switch (s.tipo) {
    case 'ACUDIENTE':
      return Boolean(s.guardian_id);
    case 'ESTUDIANTE':
      return true;
    case 'TERCERO':
      return largo(s.nombre) >= 3 && largo(s.numero_documento) >= 3 && largo(s.detalle) >= 3 && s.presento_autorizacion === true;
    case 'AUTORIDAD':
      return largo(s.nombre) >= 3 && largo(s.detalle) >= 2;
  }
}

/** Con acudiente registrado se propone el principal; si no hay, un tercero. */
export function solicitanteInicial(ficha: FichaEstudiante): SolicitanteEntrada {
  const principal = ficha.acudientes.find((a) => a.es_principal) ?? ficha.acudientes[0];
  return principal ? { tipo: 'ACUDIENTE', guardian_id: principal.guardian_id } : { tipo: 'TERCERO' };
}
