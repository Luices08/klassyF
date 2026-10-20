import { useMemo, useState } from 'react';
import {
  ELEMENTOS_AUTENTICACION,
  descargarZipDeCertificados,
  useConfiguracionCertificados,
  useExpedirLote,
  useTiposCertificado,
  type FilaLote,
  type TipoCertificado,
} from '../../hooks/useCertificados';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGroups } from '../../hooks/useGroups';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import type { Group } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { SelectBuscable } from '../ui/SelectBuscable';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';

/** Los únicos grados donde se expide por grupo: aquí se culmina un ciclo o se gradúa. */
const GRADOS_DE_GRADUACION = [0, 5, 9, 11];
const CICLO_DEL_GRADO: Record<number, string> = { 0: 'Culminación de Preescolar', 5: 'Culminación de Básica Primaria', 9: 'Culminación de Básica Secundaria', 11: 'Grado de bachiller' };

const TONO = { EXPEDIDO: 'green', YA_EXPEDIDO: 'neutral', FALLIDO: 'red' } as const;
const NOMBRE = { EXPEDIDO: 'Expedido', YA_EXPEDIDO: 'Ya tenía uno vigente', FALLIDO: 'No se pudo' } as const;

const numeroDelGrado = (g: Group): number | null => (typeof g.grade_id === 'object' ? g.grade_id.numero : null);

/** ¿Es un documento oficial de culminación o de grado? (La constancia de quien aún no se gradúa no lo es: se pide uno a uno.) */
const esDeGraduacion = (t: TipoCertificado): boolean =>
  t.fuentes.includes('CULMINACION') || (t.fuentes.includes('TITULACION') && t.estados_titulacion.length > 0 && t.estados_titulacion.every((e) => e === 'GRADUADO' || e === 'GRADUADO_EXTEMPORANEO'));

/** Los documentos oficiales de un grado: los tipos activos de graduación cuyo alcance incluye ese grado. */
const documentosDelGrado = (tipos: TipoCertificado[], numero: number): TipoCertificado[] =>
  tipos.filter((t) => t.estado === 'ACTIVO' && esDeGraduacion(t) && t.grados_numeros.includes(numero));

interface FilaConDocumento extends FilaLote {
  documento: string;
}

/**
 * Expedir los documentos de graduación a todo un grupo: Transición (diploma de culminación de Preescolar), 5° (culminación de Básica Primaria), 9° (culminación
 * de Básica Secundaria) y 11° (acta de grado y diploma de bachiller, solo para quien está apto en Titulación). El documento sale del grado del grupo: no se
 * elige. Cada estudiante es una expedición normal; quien no cumple queda en el resumen con su motivo. Se entrega al acudiente principal.
 */
export function ExpedirPorGrupo() {
  const { anio } = useAnioDeTrabajo();
  const grupos = useGroups({ academic_year_id: anio?._id });
  const tipos = useTiposCertificado();
  const configuracion = useConfiguracionCertificados();
  const lote = useExpedirLote();

  const [grupoId, setGrupoId] = useState('');
  const [filas, setFilas] = useState<FilaConDocumento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const gruposDeGraduacion = useMemo(() => (grupos.data ?? []).filter((g) => GRADOS_DE_GRADUACION.includes(numeroDelGrado(g) ?? -99)), [grupos.data]);
  const grupo = gruposDeGraduacion.find((g) => g._id === grupoId);
  const numero = grupo ? numeroDelGrado(grupo) : null;
  const documentos = numero === null ? [] : documentosDelGrado(tipos.data?.tipos ?? [], numero);

  const expedir = async () => {
    if (!grupo || documentos.length === 0) return;
    const nombres = documentos.map((d) => d.nombre).join(' y ');
    if (!window.confirm(`Se expide ${nombres} a cada estudiante del grupo que cumpla los requisitos. Cada documento consume un consecutivo oficial. ¿Continuar?`)) return;
    setError(null);
    setFilas(null);
    const acumuladas: FilaConDocumento[] = [];
    try {
      for (const d of documentos) {
        const tipo = configuracion.data?.tipos.find((t) => t.clave === d.clave);
        // Destinatario y firmas son los de partida del documento (la primera opción del selector y la política de firmas): en un lote no se eligen uno a uno.
        const firmas = tipo ? Object.fromEntries(ELEMENTOS_AUTENTICACION.map((e) => [e, tipo.elementos[e].valor_inicial])) : {};
        const primera = tipo?.destinatarios[0];
        const r = await lote.mutateAsync({ group_id: grupo._id, tipo: d.clave, destinatario: primera ? { clave: primera.clave } : null, firmas });
        acumuladas.push(...r.filas.map((f) => ({ ...f, documento: d.nombre })));
        setFilas([...acumuladas]);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const bajarZip = async () => {
    const ids = (filas ?? []).filter((f) => f.certificado_id).map((f) => f.certificado_id as string);
    if (ids.length === 0) return;
    setDescargando(true);
    try {
      const { url } = await descargarZipDeCertificados(ids);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `documentos-${new Date().toISOString().slice(0, 10)}.zip`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDescargando(false);
    }
  };

  const resumen = {
    expedidos: (filas ?? []).filter((f) => f.resultado === 'EXPEDIDO').length,
    existian: (filas ?? []).filter((f) => f.resultado === 'YA_EXPEDIDO').length,
    fallidos: (filas ?? []).filter((f) => f.resultado === 'FALLIDO').length,
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Se expide por grupo solo donde se culmina un ciclo o se gradúa: <strong>Transición, 5°, 9° y 11°</strong>. El documento sale del grado del grupo. En 11° son el acta de grado y el diploma de bachiller, solo para quienes están aptos en Titulación; a
        los demás no se les expide y quedan en el resumen con lo que les falta.
      </Alert>

      <Card className="space-y-4">
        <CardHeader title="Grupo" subtitle={anio ? `Año lectivo ${anio.year}. Solo se listan los grupos de Transición, 5°, 9° y 11°.` : undefined} />
        <SelectBuscable
          label="Grupo"
          value={grupoId}
          onChange={(v) => {
            setGrupoId(v);
            setFilas(null);
            setError(null);
          }}
          vacioLabel="Elige un grupo"
          placeholder="Buscar grupo…"
          opciones={opcionesDeGrupos(gruposDeGraduacion)}
        />
        {gruposDeGraduacion.length === 0 && !grupos.isLoading && <Alert tone="warning">No hay grupos de Transición, 5°, 9° ni 11° en el año de trabajo.</Alert>}

        {grupo && numero !== null && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-ink">{CICLO_DEL_GRADO[numero]}</p>
            {documentos.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-body">
                {documentos.map((d) => (
                  <li key={d.clave}>{d.nombre}</li>
                ))}
              </ul>
            ) : (
              <Alert tone="warning">Ningún documento de este grado está activo. Actívalo en «Tipos de documento» (el administrador o Secretaría) después de revisar su texto en «Plantillas».</Alert>
            )}
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button onClick={() => void expedir()} isLoading={lote.isPending} disabled={!grupo || documentos.length === 0}>
            Expedir a todo el grupo
          </Button>
        </div>
      </Card>

      {filas && (
        <Card className="space-y-3">
          <CardHeader
            title="Resultado"
            subtitle={`${resumen.expedidos} expedidos · ${resumen.existian} ya tenían uno vigente · ${resumen.fallidos} no se pudieron expedir`}
            action={
              <Button variant="outline" onClick={() => void bajarZip()} isLoading={descargando} disabled={resumen.expedidos + resumen.existian === 0}>
                Descargar todos (ZIP)
              </Button>
            }
          />
          <Table>
            <TableHead>
              <tr>
                <Th>Estudiante</Th>
                <Th>Documento</Th>
                <Th>Resultado</Th>
                <Th>Código</Th>
                <Th>Motivo</Th>
              </tr>
            </TableHead>
            <TableBody>
              {filas.map((f) => (
                <tr key={`${f.documento}-${f.enrollment_id}`}>
                  <Td className="font-medium text-ink">{f.estudiante}</Td>
                  <Td className="text-xs">{f.documento}</Td>
                  <Td>
                    <Chip tone={TONO[f.resultado]}>{NOMBRE[f.resultado]}</Chip>
                  </Td>
                  <Td className="font-mono text-xs">{f.codigo ?? '—'}</Td>
                  <Td className="text-xs text-body">{f.motivo ?? '—'}</Td>
                </tr>
              ))}
              {filas.length === 0 && <EmptyRow colSpan={5}>Sin estudiantes.</EmptyRow>}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
