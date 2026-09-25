import type { ReactNode } from 'react';
import type { Rol } from '../../types/api';
import type { EstadoGrupo, EstadoMatricula } from '../../types/domain';
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/** @deprecated usar Chip — se conserva como alias mientras se migran los usos existentes. */
export const Badge = Chip;

const DESEMPENO_TONE: Record<Desempeno, Tone> = {
  Superior: 'green',
  Alto: 'blue',
  Básico: 'orange',
  Bajo: 'red',
};

export function DesempenoBadge({ value }: { value: Desempeno }) {
  return <Chip tone={DESEMPENO_TONE[value]}>{value}</Chip>;
}

const ROL_LABELS: Record<Rol, string> = {
  SUPERADMIN: 'Superadministrador',
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
  SECRETARIA: 'Secretaría',
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
};

const ROL_TONE: Record<Rol, Tone> = {
  SUPERADMIN: 'blue',
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

export function EstadoUsuarioBadge({ value }: { value: 'activo' | 'inactivo' }) {
  return <Chip tone={value === 'activo' ? 'green' : 'red'}>{value === 'activo' ? 'Activo' : 'Inactivo'}</Chip>;
}

const GRUPO_LABELS: Record<EstadoGrupo, string> = { ACTIVE: 'Activo', CLOSED: 'Cerrado' };

export function EstadoGrupoBadge({ value }: { value: EstadoGrupo }) {
  return <Chip tone={value === 'ACTIVE' ? 'green' : 'red'}>{GRUPO_LABELS[value]}</Chip>;
}

const MATRICULA_LABELS: Record<EstadoMatricula, string> = {
  PREINSCRITO: 'Preinscrito',
  MATRICULADO: 'Matriculado',
  RETIRADO: 'Retirado',
  TRASLADADO: 'Trasladado',
};

const MATRICULA_TONE: Record<EstadoMatricula, Tone> = {
  PREINSCRITO: 'neutral',
  MATRICULADO: 'green',
  RETIRADO: 'red',
  TRASLADADO: 'orange',
};

export function EstadoMatriculaBadge({ value }: { value: EstadoMatricula }) {
  return <Chip tone={MATRICULA_TONE[value]}>{MATRICULA_LABELS[value]}</Chip>;
}

/** Cupos de un grupo: rojo si esta lleno, naranja si casi lleno (>=80%), verde en el resto. */
export function CupoBadge({ ocupados, max }: { ocupados: number; max: number }) {
  const ratio = max > 0 ? ocupados / max : 0;
  const tone: Tone = ratio >= 1 ? 'red' : ratio >= 0.8 ? 'orange' : 'green';
  return <Chip tone={tone}>{`${ocupados} / ${max}`}</Chip>;
}
