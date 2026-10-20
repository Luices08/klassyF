import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { type FormatoListado, type TipoListado, useExportarListado } from '../../hooks/useReportes';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { FiltrosAlcance, useFiltrosAlcance } from './FiltrosAlcance';

const PERSONAL_DE_MATRICULAS = ['ADMIN', 'COORDINADOR', 'SECRETARIA'];
// El balance de inclusión es información de estudiantes con necesidades de apoyo: Secretaría no entra (el servidor lo vuelve a comprobar).
const PERSONAL_DE_INCLUSION = ['ADMIN', 'ORIENTADOR', 'COORDINADOR'];

const LISTADOS: Array<{ clave: TipoListado; nombre: string; descripcion: string; roles: string[] }> = [
  {
    clave: 'recuperacion-final',
    nombre: 'Estudiantes en recuperación final',
    descripcion:
      'Quién debe presentar la nivelación de cierre, con la asignatura pendiente, el docente responsable, la nota del año y si aún tiene derecho a recuperar. Si lo baja antes de la recuperación sirve para citar a las familias; después muestra quién ya la superó.',
    roles: PERSONAL_DE_MATRICULAS,
  },
  {
    clave: 'retirados',
    nombre: 'Retirados y trasladados',
    descripcion: 'Quién salió del colegio durante el año, con la fecha, el motivo, la institución que lo recibe (si fue traslado) y sus inasistencias hasta ese día.',
    roles: PERSONAL_DE_MATRICULAS,
  },
  {
    clave: 'servicio-social',
    nombre: 'Servicio social de décimo y once',
    descripcion: 'Por estudiante: la entidad receptora, las horas con soporte verificado, las que están por verificar y si cumple lo que exige el colegio (Aprobado o Pendiente).',
    roles: PERSONAL_DE_MATRICULAS,
  },
  {
    clave: 'balance-inclusion',
    nombre: 'Balance anual de inclusión (confidencial)',
    descripcion:
      'Cómo va cada expediente de inclusión: estado, autorización de datos, ajustes con el seguimiento mínimo e informe anual. No incluye diagnósticos ni categoría de discapacidad. Coordinación lo ve sin la modalidad de cada estudiante.',
    roles: PERSONAL_DE_INCLUSION,
  },
];

/** Listados de cierre en Excel y PDF. No guardan nada: cada descarga se calcula con lo que haya en ese momento. */
export function ListadosPanel({ anioPorDefecto }: { anioPorDefecto?: string }) {
  const { user } = useAuth();
  const disponibles = LISTADOS.filter((l) => user && l.roles.includes(user.rol));
  const filtros = useFiltrosAlcance(anioPorDefecto);
  const [elegido, setTipo] = useState<TipoListado | ''>('');
  const exportar = useExportarListado();
  const listado = disponibles.find((l) => l.clave === elegido) ?? disponibles[0];

  if (!listado) return <Alert tone="info">Su perfil no tiene listados de cierre disponibles.</Alert>;
  const tipo = listado.clave;

  const descargar = (formato: FormatoListado) => {
    if (!filtros.alcance.academic_year_id) return;
    exportar.mutate({
      tipo,
      formato,
      filtros: filtros.alcance,
      nombreArchivo: [tipo, filtros.anio?.year ?? '', filtros.grupo ? `${typeof filtros.grupo.grade_id === 'object' ? filtros.grupo.grade_id.numero : ''}-${filtros.grupo.nomenclatura}` : 'todos-los-grupos']
        .filter((x) => x !== '')
        .join('-'),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4">
          <Select label="Listado" value={tipo} onChange={(e) => setTipo(e.target.value as TipoListado)}>
            {disponibles.map((l) => (
              <option key={l.clave} value={l.clave}>
                {l.nombre}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-muted">{listado.descripcion}</p>
        </div>
        <FiltrosAlcance filtros={filtros} />
        <p className="mt-3 text-xs text-muted">Sin elegir un grupo se descarga todo lo que cubran los filtros en una sola hoja. El archivo se calcula al descargarlo y su encabezado dice en qué punto están los datos.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => descargar('excel')} disabled={!filtros.alcance.academic_year_id || exportar.isPending}>
            Exportar (Excel)
          </Button>
          <Button variant="outline" onClick={() => descargar('pdf')} disabled={!filtros.alcance.academic_year_id || exportar.isPending}>
            Exportar (PDF)
          </Button>
        </div>
      </Card>
      {exportar.isError && <Alert tone="error">{errorMessage(exportar.error)}</Alert>}
      {exportar.isPending && <Alert tone="info">Preparando el archivo…</Alert>}
    </div>
  );
}
