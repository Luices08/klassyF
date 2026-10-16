import type { ComponentType } from 'react';
import {
  ActivityIcon,
  BookIcon,
  CalculatorIcon,
  FlaskIcon,
  GlobeIcon,
  MessageCircleIcon,
  MonitorIcon,
  PaletteIcon,
} from '../components/ui/icons';

export interface EstiloAsignatura {
  Icon: ComponentType<{ className?: string }>;
  contenedorClases: string;
  bordeClases: string;
}

function normalizarTexto(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Determina el icono, fondo suave y borde delgado temático de una asignatura de acuerdo a su nombre o área.
 * Compartido entre docentes y estudiantes para garantizar consistencia visual y no duplicar código.
 */
export function obtenerEstiloAsignatura(nombre: string, areaNombre?: string): EstiloAsignatura {
  const norm = normalizarTexto(`${nombre} ${areaNombre ?? ''}`);

  if (norm.includes('matemat') || norm.includes('calcul') || norm.includes('algebra') || norm.includes('trigono')) {
    return {
      Icon: CalculatorIcon,
      contenedorClases: 'bg-blue-50 text-blue-600',
      bordeClases: '!border-blue-200 hover:!border-blue-300',
    };
  }
  if (norm.includes('contab') || norm.includes('financ') || norm.includes('econom') || norm.includes('comerc')) {
    return {
      Icon: CalculatorIcon,
      contenedorClases: 'bg-slate-100 text-slate-700',
      bordeClases: '!border-slate-300 hover:!border-slate-400',
    };
  }
  if (
    norm.includes('espanol') ||
    norm.includes('lengua') ||
    norm.includes('castell') ||
    norm.includes('literat') ||
    norm.includes('lectur')
  ) {
    return {
      Icon: BookIcon,
      contenedorClases: 'bg-purple-50 text-purple-600',
      bordeClases: '!border-purple-200 hover:!border-purple-300',
    };
  }
  if (
    norm.includes('cienc') ||
    norm.includes('natural') ||
    norm.includes('biolog') ||
    norm.includes('quimic') ||
    norm.includes('fisic')
  ) {
    return {
      Icon: FlaskIcon,
      contenedorClases: 'bg-emerald-50 text-emerald-600',
      bordeClases: '!border-emerald-200 hover:!border-emerald-300',
    };
  }
  if (
    norm.includes('social') ||
    norm.includes('histor') ||
    norm.includes('geograf') ||
    norm.includes('filosof') ||
    norm.includes('ciudadan') ||
    norm.includes('democr')
  ) {
    return {
      Icon: GlobeIcon,
      contenedorClases: 'bg-amber-50 text-amber-600',
      bordeClases: '!border-amber-200 hover:!border-amber-300',
    };
  }
  if (
    norm.includes('tecnol') ||
    norm.includes('informat') ||
    norm.includes('comput') ||
    norm.includes('sistem') ||
    norm.includes('programac')
  ) {
    return {
      Icon: MonitorIcon,
      contenedorClases: 'bg-sky-50 text-sky-600',
      bordeClases: '!border-sky-200 hover:!border-sky-300',
    };
  }
  if (norm.includes('art') || norm.includes('dibuj') || norm.includes('music') || norm.includes('danz') || norm.includes('teatr')) {
    return {
      Icon: PaletteIcon,
      contenedorClases: 'bg-rose-50 text-rose-600',
      bordeClases: '!border-rose-200 hover:!border-rose-300',
    };
  }
  if (norm.includes('educacion fisica') || norm.includes('deport') || norm.includes('recreac') || norm.includes('ludic')) {
    return {
      Icon: ActivityIcon,
      contenedorClases: 'bg-indigo-50 text-indigo-600',
      bordeClases: '!border-indigo-200 hover:!border-indigo-300',
    };
  }
  if (norm.includes('ingl') || norm.includes('idiom') || norm.includes('extranj') || norm.includes('franc')) {
    return {
      Icon: MessageCircleIcon,
      contenedorClases: 'bg-teal-50 text-teal-600',
      bordeClases: '!border-teal-200 hover:!border-teal-300',
    };
  }

  return {
    Icon: BookIcon,
    contenedorClases: 'bg-primary-soft text-primary',
    bordeClases: '!border-blue-200 hover:!border-blue-300',
  };
}
