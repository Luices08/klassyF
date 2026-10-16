import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import {
  type OrigenAccesoBoletin,
  useEstablecerAccesoEstudiante,
  useEstablecerPublicacionGrupo,
  usePublicacionBoletin,
} from '../../hooks/useBoletin';
import { useGroups } from '../../hooks/useGroups';
import { formatoFechaHora } from '../../lib/fechas';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { SelectBuscable } from '../ui/SelectBuscable';

const TEXTO_ORIGEN: Record<OrigenAccesoBoletin, string> = {
  GRUPO: 'Lo decidió el grupo',
  EXCEPCION: 'Excepción de este estudiante',
  SIN_PUBLICAR: 'Aún sin publicar',
};

/**
 * Qué estudiantes y acudientes ven su boletín (M17). El administrador publica el boletín de un grupo por periodo y puede dejar
 * excepciones por estudiante (bloquear a uno aunque el grupo esté publicado, o dejar ver a uno aunque no lo esté). El personal del
 * colegio lo ve siempre. Lo hace cumplir el servidor, no esta pantalla.
 */
export function AccesoBoletin({ puedeEditar }: { puedeEditar: boolean }) {
  const { anio: anioPorDefecto, anios } = useAnioDeTrabajo();
  const [anioElegidoId, setAnioElegidoId] = useState('');
  const anioId = anioElegidoId || anioPorDefecto?._id || '';
  const anio = anios.find((a) => a._id === anioId);
  const [periodoElegido, setPeriodoElegido] = useState<number | null>(null);
  const periodo = anio?.periodos.some((p) => p.numero === periodoElegido) ? (periodoElegido as number) : anio?.periodos[0]?.numero;
  const [grupoId, setGrupoId] = useState('');

  const grupos = useGroups({ academic_year_id: anioId || undefined });
  const publicacion = usePublicacionBoletin({ group_id: grupoId || undefined, academic_year_id: anioId || undefined, periodo_numero: periodo });
  const publicarGrupo = useEstablecerPublicacionGrupo();
  const accesoEstudiante = useEstablecerAccesoEstudiante();

  const referencia = grupoId && anioId && periodo ? { group_id: grupoId, academic_year_id: anioId, periodo_numero: periodo } : null;
  const datos = publicacion.data;
  const visibles = datos?.estudiantes.filter((e) => e.visible).length ?? 0;
  const errorAccion = publicarGrupo.error ?? accesoEstudiante.error;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Mientras un boletín no esté publicado, solo lo ven el administrador, coordinación, secretaría y los docentes. Al publicarlo, los estudiantes y sus
        acudientes pueden verlo y descargarlo. Una excepción por estudiante manda sobre lo que decidas para el grupo.
      </Alert>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Año lectivo"
            value={anioId}
            onChange={(e) => {
              setAnioElegidoId(e.target.value);
              setGrupoId('');
            }}
          >
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </Select>
          <Select label="Periodo" value={periodo ?? ''} onChange={(e) => setPeriodoElegido(Number(e.target.value))} disabled={!anio?.periodos.length}>
            {(anio?.periodos ?? []).map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.nombre || `Periodo ${p.numero}`}
              </option>
            ))}
          </Select>
          <SelectBuscable
            label="Grupo"
            value={grupoId}
            onChange={setGrupoId}
            placeholder="Buscar grupo…"
            vacioLabel="Selecciona..."
            opciones={opcionesDeGrupos(grupos.data ?? [])}
          />
        </div>
      </Card>

      {publicacion.isLoading && referencia && <Spinner label="Cargando estudiantes..." />}
      {publicacion.isError && <Alert tone="error">{errorMessage(publicacion.error)}</Alert>}
      {errorAccion && <Alert tone="error">{errorMessage(errorAccion)}</Alert>}

      {datos && referencia && (
        <>
          <Card>
            <CardHeader
              title="Publicación del grupo"
              subtitle={
                datos.publicado && datos.publicado_at
                  ? `Publicado el ${formatoFechaHora(datos.publicado_at)}. Lo ven ${visibles} de ${datos.estudiantes.length} estudiantes.`
                  : `Sin publicar. Lo ven ${visibles} de ${datos.estudiantes.length} estudiantes (solo por excepción).`
              }
              action={
                <div className="flex items-center gap-3">
                  <Chip tone={datos.publicado ? 'green' : 'neutral'}>{datos.publicado ? 'Publicado' : 'Sin publicar'}</Chip>
                  {puedeEditar && (
                    <Button
                      type="button"
                      variant={datos.publicado ? 'soft-danger' : 'primary'}
                      isLoading={publicarGrupo.isPending}
                      onClick={() => publicarGrupo.mutate({ ...referencia, publicado: !datos.publicado })}
                    >
                      {datos.publicado ? 'Retirar boletín' : 'Publicar boletín'}
                    </Button>
                  )}
                </div>
              }
            />
          </Card>

          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Documento</Th>
              <Th>¿Ve su boletín?</Th>
              <Th>Motivo</Th>
              {puedeEditar && <Th className="text-right">Excepción</Th>}
            </TableHead>
            <TableBody>
              {datos.estudiantes.length === 0 && <EmptyRow colSpan={puedeEditar ? 5 : 4}>Este grupo no tiene estudiantes con matrícula activa.</EmptyRow>}
              {datos.estudiantes.map((est) => (
                <tr key={est.student_id}>
                  <Td>{est.nombre_completo}</Td>
                  <Td>{est.documento}</Td>
                  <Td>
                    <Chip tone={est.visible ? 'green' : 'red'}>{est.visible ? 'Sí' : 'No'}</Chip>
                  </Td>
                  <Td>{TEXTO_ORIGEN[est.origen]}</Td>
                  {puedeEditar && (
                    <Td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant={est.visible ? 'soft-danger' : 'soft-success'}
                          disabled={accesoEstudiante.isPending}
                          onClick={() => accesoEstudiante.mutate({ ...referencia, student_id: est.student_id, permitir: !est.visible })}
                        >
                          {est.visible ? 'Bloquear' : 'Permitir'}
                        </Button>
                        {est.origen === 'EXCEPCION' && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={accesoEstudiante.isPending}
                            onClick={() => accesoEstudiante.mutate({ ...referencia, student_id: est.student_id, permitir: null })}
                          >
                            Quitar excepción
                          </Button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
