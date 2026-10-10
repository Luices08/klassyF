import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { useVerificacionPublica, type ConsultaVerificacion, type ResultadoVerificacion } from '../../hooks/useCertificados';
import { formatoFechaHora } from '../../lib/fechas';

/**
 * Verificación pública de autenticidad (M26), sin sesión. Se llega escaneando el QR del documento (`/verificar/<token>`) o
 * escribiendo el código y la clave impresos en su pie. Solo muestra lo mínimo: nunca notas ni datos sensibles.
 */
export function VerificarCertificadoPage() {
  const { token } = useParams<{ token?: string }>();
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [manual, setManual] = useState<ConsultaVerificacion | null>(null);
  const consulta: ConsultaVerificacion | null = token ? { token } : manual;
  const resultado = useVerificacionPublica(consulta);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setManual({ codigo: codigo.trim(), clave: clave.trim() });
  };

  return (
    <div className="min-h-screen bg-soft text-body">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-semibold text-ink">Verificación de documentos</span>
          <Link to="/" className="text-sm font-semibold text-primary hover:underline">
            Ir al inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
        {!token && (
          <Card>
            <CardHeader title="Verifica un certificado o constancia" subtitle="Escribe el código y la clave que aparecen al pie del documento, o escanea su código QR." />
            <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
              <Input label="Código del documento" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="CE-2026-0001" required maxLength={30} />
              <Input label="Clave de verificación" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="12 caracteres" required maxLength={20} />
              <Button type="submit" disabled={!codigo.trim() || !clave.trim()}>
                Verificar
              </Button>
            </form>
          </Card>
        )}
        {resultado.isFetching && <Spinner label="Verificando..." />}
        {resultado.isError && <Alert tone="error">{errorMessage(resultado.error)}</Alert>}
        {resultado.data && !resultado.isFetching && <Resultado r={resultado.data} />}
      </main>
    </div>
  );
}

function Resultado({ r }: { r: ResultadoVerificacion }) {
  if (r.resultado === 'NO_VERIFICABLE') {
    return <Alert tone="error">{r.mensaje}</Alert>;
  }
  return (
    <div className="space-y-3">
      {r.resultado === 'VALIDO' && <Alert tone="success">Documento auténtico: fue expedido por {r.institucion} y su contenido no ha sido alterado.{r.vigencia?.hasta ? ` Vigente hasta el ${formatoFechaHora(r.vigencia.hasta)}.` : ''}</Alert>}
      {r.resultado === 'VIGENCIA_CUMPLIDA' && (
        <Alert tone="warning">
          Documento auténtico expedido por {r.institucion}, pero su vigencia de {r.vigencia?.dias} días terminó{r.vigencia?.hasta ? ` el ${formatoFechaHora(r.vigencia.hasta)}` : ''}. Pide uno nuevo si la entidad que lo recibe lo exige reciente.
        </Alert>
      )}
      {r.resultado === 'ANULADO' && (
        <Alert tone="error">
          <p className="font-bold uppercase">Documento anulado: no tiene validez.</p>
          <p>
            Fue expedido por {r.institucion}, pero la institución lo anuló{r.anulado_el ? ` el ${formatoFechaHora(r.anulado_el)}` : ''}. No lo acepte: solicite uno nuevo a la institución.
          </p>
        </Alert>
      )}
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Dato etiqueta="Documento" valor={r.tipo} />
          <Dato etiqueta="Código" valor={r.codigo} />
          <Dato etiqueta="Estudiante" valor={r.estudiante ?? '—'} />
          <Dato etiqueta="Documento de identidad" valor={r.documento ?? '—'} />
          <Dato etiqueta="Fecha de expedición" valor={formatoFechaHora(r.fecha_emision)} />
          <Dato etiqueta="Institución" valor={r.institucion} />
        </dl>
        <p className="mt-4 text-xs text-muted">Compara estos datos con los del documento que tienes en la mano. Por privacidad no se muestran notas ni otros datos del estudiante.</p>
      </Card>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{etiqueta}</dt>
      <dd className="mt-0.5 text-ink">{valor}</dd>
    </div>
  );
}
