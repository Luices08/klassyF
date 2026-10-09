import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import {
  ELEMENTOS_AUTENTICACION,
  ETIQUETA_ELEMENTO,
  ETIQUETA_ESTADO_MATRICULA,
  abrirPdfCertificado,
  abrirVistaPrevia,
  useConfiguracionCertificados,
  useExpedirCertificado,
  useMatriculasExpedibles,
  type CertificadoExpedido,
  type ClaveCertificado,
  type ElementoAutenticacion,
} from '../../hooks/useCertificados';
import { useStudentsDirectory } from '../../hooks/useStudents';

const MIN_BUSQUEDA = 3;

/**
 * Expedir una constancia o certificado. Lo único que se elige es el estudiante, la matrícula (año), el documento y qué
 * estampar: todo el contenido (colegio, DANE, datos del alumno, grado, folio) lo arma el servidor con lo que ya conoce.
 */
export function ExpedirCertificado({ estudianteInicial }: { estudianteInicial?: string }) {
  const [busqueda, setBusqueda] = useState('');
  const [estudianteId, setEstudianteId] = useState<string | undefined>(estudianteInicial);
  const [matriculaElegida, setMatriculaElegida] = useState('');
  const [tipoElegido, setTipoElegido] = useState<ClaveCertificado | ''>('');
  const [destinatario, setDestinatario] = useState('');
  // Lo que el usuario tocó, atado a la matrícula y el documento elegidos: al cambiar cualquiera de los dos se vuelve a la política.
  const [manual, setManual] = useState<{ clave: string; valores: Partial<Record<ElementoAutenticacion, boolean>> }>({ clave: '', valores: {} });
  const [expedido, setExpedido] = useState<CertificadoExpedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generandoPrevia, setGenerandoPrevia] = useState(false);

  const texto = busqueda.trim();
  const resultados = useStudentsDirectory({ search: texto, limit: 6 }, texto.length >= MIN_BUSQUEDA && !estudianteId);
  const matriculas = useMatriculasExpedibles(estudianteId);
  const configuracion = useConfiguracionCertificados();
  const expedir = useExpedirCertificado();

  // Al abrir un estudiante se propone su matrícula más reciente y el primer documento que aplica.
  const matriculaId = matriculas.data?.matriculas.some((m) => m._id === matriculaElegida) ? matriculaElegida : (matriculas.data?.matriculas[0]?._id ?? '');
  const matricula = matriculas.data?.matriculas.find((m) => m._id === matriculaId);
  const tipo: ClaveCertificado | '' = matricula?.tipos.includes(tipoElegido as ClaveCertificado) ? tipoElegido : (matricula?.tipos[0] ?? '');
  const configuracionDelTipo = configuracion.data?.tipos.find((t) => t.clave === tipo);

  // Cada documento arranca con los switches que su política define.
  const claveManual = `${matriculaId}:${tipo}`;
  const firmas: Partial<Record<ElementoAutenticacion, boolean>> = {
    ...(configuracionDelTipo ? Object.fromEntries(ELEMENTOS_AUTENTICACION.map((e) => [e, configuracionDelTipo.elementos[e].valor_inicial])) : {}),
    ...(manual.clave === claveManual ? manual.valores : {}),
  };

  const entrada = matricula && tipo ? { enrollment_id: matricula._id, tipo, destinatario: destinatario.trim() || null, firmas } : null;

  const elegirEstudiante = (id: string | undefined) => {
    setEstudianteId(id);
    setBusqueda('');
    setExpedido(null);
    setError(null);
    setDestinatario('');
  };

  const verPrevia = async () => {
    if (!entrada) return;
    setError(null);
    setGenerandoPrevia(true);
    try {
      await abrirVistaPrevia(entrada);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerandoPrevia(false);
    }
  };

  const expedirDocumento = async () => {
    if (!entrada) return;
    setError(null);
    try {
      const certificado = await expedir.mutateAsync(entrada);
      setExpedido(certificado);
      await abrirPdfCertificado(certificado._id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const descripcionDeElemento = (elemento: ElementoAutenticacion): string | undefined => {
    if (!configuracion.data) return undefined;
    if (elemento === 'sello') return 'Imagen del sello del colegio.';
    const firmante = configuracion.data[elemento];
    return [firmante.nombre, firmante.cargo].filter(Boolean).join(' · ');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Estudiante" subtitle="Busca por nombre o documento; el sistema ya conoce el resto de sus datos." />
        {!estudianteId ? (
          <div className="space-y-2">
            <Input label="Buscar estudiante" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, apellido o número de documento" autoFocus />
            {texto.length > 0 && texto.length < MIN_BUSQUEDA && <p className="text-xs text-muted">Escribe al menos {MIN_BUSQUEDA} caracteres.</p>}
            {resultados.isFetching && <Spinner />}
            {resultados.isError && <Alert tone="error">{errorMessage(resultados.error)}</Alert>}
            {resultados.data && texto.length >= MIN_BUSQUEDA && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {resultados.data.data.map((s) => (
                  <li key={s._id}>
                    <button type="button" onClick={() => elegirEstudiante(s._id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-soft">
                      <span className="font-semibold text-ink">
                        {s.apellido} {s.nombre}
                      </span>
                      <span className="text-xs text-muted">
                        {s.tipo_documento} {s.numero_documento}
                      </span>
                    </button>
                  </li>
                ))}
                {resultados.data.data.length === 0 && <li className="px-3 py-3 text-sm text-muted">Sin coincidencias.</li>}
              </ul>
            )}
          </div>
        ) : matriculas.isLoading ? (
          <Spinner />
        ) : matriculas.isError ? (
          <div className="space-y-2">
            <Alert tone="error">{errorMessage(matriculas.error)}</Alert>
            <Button variant="secondary" onClick={() => elegirEstudiante(undefined)}>
              Elegir otro estudiante
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-body">
              <span className="font-semibold text-ink">
                {matriculas.data?.estudiante.apellido} {matriculas.data?.estudiante.nombre}
              </span>{' '}
              · {matriculas.data?.estudiante.numero_documento}
            </p>
            <Button variant="secondary" onClick={() => elegirEstudiante(undefined)}>
              Cambiar
            </Button>
          </div>
        )}
      </Card>

      {estudianteId && matriculas.data && (
        <Card>
          <CardHeader title="Documento" />
          {matriculas.data.matriculas.length === 0 ? (
            <Alert tone="warning">Este estudiante no tiene una matrícula formalizada: no hay documentos para expedir.</Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Matrícula" value={matriculaId} onChange={(e) => setMatriculaElegida(e.target.value)}>
                  {matriculas.data.matriculas.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.anio} · {m.grado} {m.grupo} · {ETIQUETA_ESTADO_MATRICULA[m.estado] ?? m.estado}
                    </option>
                  ))}
                </Select>
                <Select label="Documento a expedir" value={tipo} onChange={(e) => setTipoElegido(e.target.value as ClaveCertificado)}>
                  {matricula?.tipos.map((t) => (
                    <option key={t} value={t}>
                      {configuracion.data?.tipos.find((c) => c.clave === t)?.nombre ?? t}
                    </option>
                  ))}
                </Select>
              </div>
              {configuracionDelTipo && <p className="text-xs text-muted">{configuracionDelTipo.descripcion}</p>}
              <Input label="Destinatario o propósito (opcional)" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} maxLength={120} placeholder="Ej. la EPS, el subsidio de transporte" hint="Si lo dejas vacío, dice «a solicitud del interesado»." />
            </div>
          )}
        </Card>
      )}

      {configuracionDelTipo && matricula && (
        <Card>
          <CardHeader title="Firmas y sello" subtitle="Decide qué se estampa en este documento. Apagado, queda la línea con nombre y cargo para la firma manuscrita." />
          <div className="space-y-4">
            {ELEMENTOS_AUTENTICACION.map((elemento) => {
              const estado = configuracionDelTipo.elementos[elemento];
              const apagadoPorPolitica = !estado.disponible || estado.bloqueado;
              return (
                <Switch
                  key={elemento}
                  label={ETIQUETA_ELEMENTO[elemento]}
                  description={descripcionDeElemento(elemento)}
                  checked={estado.bloqueado ? true : Boolean(firmas[elemento])}
                  onChange={(valor) => setManual({ clave: claveManual, valores: { ...(manual.clave === claveManual ? manual.valores : {}), [elemento]: valor } })}
                  disabled={apagadoPorPolitica}
                  disabledReason={estado.bloqueado ? 'Obligatorio en este documento.' : estado.motivo}
                />
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted">El código QR y la huella de integridad se incluyen siempre: no se pueden apagar.</p>
        </Card>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {expedido && (
        <Alert tone="success">
          Se expidió <strong>{expedido.nombre_tipo}</strong> con el código <strong>{expedido.codigo}</strong> (clave de verificación {expedido.huella}). Puedes reimprimirlo desde el historial.
        </Alert>
      )}

      {entrada && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={verPrevia} isLoading={generandoPrevia}>
            Vista previa
          </Button>
          <Button onClick={expedirDocumento} isLoading={expedir.isPending}>
            Expedir
          </Button>
        </div>
      )}
    </div>
  );
}
