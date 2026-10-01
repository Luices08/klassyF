import type { ReactNode } from 'react';
import type { Rol } from '../../types/api';
import type {
  EstadoActivo,
  EstadoAnioLectivo,
  EstadoDesarrolloCurricular,
  EstadoDocumentoMatricula,
  EstadoEspacio,
  EstadoEstudiante,
  EstadoGrupo,
  EstadoMatricula,
  EstadoPeriodoAcademico,
  NivelDesempeno,
} from '../../types/domain';
import { NOMBRES_ESTADO_ESPACIO } from '../../types/domain';
import type { Desempeno } from '../../types/reportCard';

export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  blue: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-success',
  orange: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  neutral: 'bg-soft text-muted',
};

/** Pildora con fondo claro y texto en el tono oscuro de su misma familia (Klassy UI Spec). */
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/** @deprecated usar Chip — se conserva como alias mientras se migran los usos existentes. */
export const Badge = Chip;

// Color por nivel (fijo, Decreto 1290), nunca por etiqueta (esa sí la personaliza la institución).
const DESEMPENO_TONE: Record<NivelDesempeno, Tone> = {
  SUPERIOR: 'green',
  ALTO: 'blue',
  BASICO: 'orange',
  BAJO: 'red',
};

export function DesempenoBadge({ value }: { value: Desempeno }) {
  return <Chip tone={DESEMPENO_TONE[value.nivel]}>{value.etiqueta}</Chip>;
}

export const ROL_LABELS: Record<Rol, string> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
  SECRETARIA: 'Secretaría',
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
};

const ROL_TONE: Record<Rol, Tone> = {
  ADMIN: 'blue',
  COORDINADOR: 'blue',
  SECRETARIA: 'blue',
  DOCENTE: 'green',
  ESTUDIANTE: 'orange',
  ACUDIENTE: 'neutral',
};

export function RolBadge({ value }: { value: Rol }) {
  return <Chip tone={ROL_TONE[value]}>{ROL_LABELS[value]}</Chip>;
}

/** Activo/inactivo generico: reusado por usuarios, sedes, instituciones y grados. */
export function EstadoUsuarioBadge({ value }: { value: EstadoActivo }) {
  return <Chip tone={value === 'activo' ? 'green' : 'red'}>{value === 'activo' ? 'Activo' : 'Inactivo'}</Chip>;
}

const GRUPO_LABELS: Record<EstadoGrupo, string> = { ACTIVE: 'Activo', CLOSED: 'Cerrado' };

export function EstadoGrupoBadge({ value }: { value: EstadoGrupo }) {
  return <Chip tone={value === 'ACTIVE' ? 'green' : 'red'}>{GRUPO_LABELS[value]}</Chip>;
}

const MATRICULA_LABELS: Record<EstadoMatricula, string> = {
  PREINSCRITO: 'Preinscrito',
  MATRICULADO_CONDICIONAL: 'Matriculado (condicional)',
  MATRICULADO_DEFINITIVO: 'Matriculado (definitivo)',
  RETIRADO: 'Retirado',
  ANULADO: 'Anulado',
};

const MATRICULA_TONE: Record<EstadoMatricula, Tone> = {
  PREINSCRITO: 'neutral',
  MATRICULADO_CONDICIONAL: 'orange',
  MATRICULADO_DEFINITIVO: 'green',
  RETIRADO: 'red',
  ANULADO: 'red',
};

export function EstadoMatriculaBadge({ value }: { value: EstadoMatricula }) {
  return <Chip tone={MATRICULA_TONE[value]}>{MATRICULA_LABELS[value]}</Chip>;
}

const ESTUDIANTE_LABELS: Record<EstadoEstudiante, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  RETIRADO: 'Retirado',
  GRADUADO: 'Graduado',
};

const ESTUDIANTE_TONE: Record<EstadoEstudiante, Tone> = {
  ACTIVO: 'green',
  INACTIVO: 'neutral',
  RETIRADO: 'red',
  GRADUADO: 'blue',
};

/** Estado del expediente (M03): distinto del activo/inactivo generico de la cuenta de acceso. */
export function EstadoEstudianteBadge({ value }: { value: EstadoEstudiante }) {
  return <Chip tone={ESTUDIANTE_TONE[value]}>{ESTUDIANTE_LABELS[value]}</Chip>;
}

const DOCUMENTO_LABELS: Record<EstadoDocumentoMatricula, string> = {
  PENDIENTE: 'Pendiente',
  CARGADO: 'Cargado',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

const DOCUMENTO_TONE: Record<EstadoDocumentoMatricula, Tone> = {
  PENDIENTE: 'neutral',
  CARGADO: 'blue',
  APROBADO: 'green',
  RECHAZADO: 'red',
};

/** Estado de un item del checklist documental de una matricula (M04). */
export function EstadoDocumentoBadge({ value }: { value: EstadoDocumentoMatricula }) {
  return <Chip tone={DOCUMENTO_TONE[value]}>{DOCUMENTO_LABELS[value]}</Chip>;
}

/** Cupos de un grupo: rojo si esta lleno, naranja si casi lleno (>=80%), verde en el resto. */
export function CupoBadge({ ocupados, max }: { ocupados: number; max: number }) {
  const ratio = max > 0 ? ocupados / max : 0;
  const tone: Tone = ratio >= 1 ? 'red' : ratio >= 0.8 ? 'orange' : 'green';
  return <Chip tone={tone}>{`${ocupados} / ${max}`}</Chip>;
}

const ANIO_LABELS: Record<EstadoAnioLectivo, string> = {
  PLANIFICACION: 'Planificación',
  EN_CURSO: 'Vigente',
  CERRADO: 'Cerrado',
};

const ANIO_TONE: Record<EstadoAnioLectivo, Tone> = {
  PLANIFICACION: 'neutral',
  EN_CURSO: 'green',
  CERRADO: 'red',
};

/** Estado de la vigencia (M05): solo una puede estar Vigente; las cerradas son historico de solo lectura. */
export function EstadoAnioLectivoBadge({ value }: { value: EstadoAnioLectivo }) {
  return <Chip tone={ANIO_TONE[value]}>{ANIO_LABELS[value]}</Chip>;
}

const PERIODO_LABELS: Record<EstadoPeriodoAcademico, string> = {
  PROGRAMADO: 'Programado',
  ABIERTO: 'En curso',
  EN_DIGITACION: 'En digitación',
  CERRADO: 'Cerrado',
};

const PERIODO_TONE: Record<EstadoPeriodoAcademico, Tone> = {
  PROGRAMADO: 'neutral',
  ABIERTO: 'green',
  EN_DIGITACION: 'orange',
  CERRADO: 'red',
};

/** Semaforo del periodo academico (M05): programado, en curso, en digitacion, cerrado. */
export function EstadoPeriodoBadge({ value }: { value: EstadoPeriodoAcademico }) {
  return <Chip tone={PERIODO_TONE[value]}>{PERIODO_LABELS[value]}</Chip>;
}

const ESPACIO_TONE: Record<EstadoEspacio, Tone> = {
  DISPONIBLE: 'green',
  EN_MANTENIMIENTO: 'orange',
  INACTIVO: 'red',
};

/** Estado operativo de un espacio físico (M10): solo los disponibles se pueden asignar. */
export function EstadoEspacioBadge({ value }: { value: EstadoEspacio }) {
  return <Chip tone={ESPACIO_TONE[value]}>{NOMBRES_ESTADO_ESPACIO[value]}</Chip>;
}

const DESARROLLO_CURRICULAR_LABELS: Record<EstadoDesarrolloCurricular, string> = {
  BORRADOR: 'Borrador',
  ENVIADO_REVISION: 'Enviado a revisión',
  DEVUELTO_OBSERVACIONES: 'Devuelto con observaciones',
  APROBADO: 'Aprobado',
};

const DESARROLLO_CURRICULAR_TONE: Record<EstadoDesarrolloCurricular, Tone> = {
  BORRADOR: 'blue',
  ENVIADO_REVISION: 'orange',
  DEVUELTO_OBSERVACIONES: 'red',
  APROBADO: 'green',
};

/** Estado del workflow de planeación pedagógica (M07): borrador -> enviado -> aprobado/devuelto. */
export function EstadoDesarrolloCurricularBadge({ value }: { value: EstadoDesarrolloCurricular }) {
  return <Chip tone={DESARROLLO_CURRICULAR_TONE[value]}>{DESARROLLO_CURRICULAR_LABELS[value]}</Chip>;
}

/** Vigente/Histórico de un referente del banco M07 (DBA/EBC/Lineamiento): mismo campo `estado` activo/inactivo, otra etiqueta. */
export function EstadoVigenciaReferenteBadge({ value }: { value: EstadoActivo }) {
  return <Chip tone={value === 'activo' ? 'green' : 'neutral'}>{value === 'activo' ? 'Vigente' : 'Histórico'}</Chip>;
}
