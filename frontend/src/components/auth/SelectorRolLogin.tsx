import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import { ROLES } from '../../types/api';
import { ROL_LABELS } from '../ui/Badge';
import { BuildingIcon, ClipboardListIcon, EyeIcon, GraduationCapIcon, UserIcon, UsersIcon } from '../ui/icons';

interface InfoPerfil {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Familias de color de la guía visual: azul = administrativo, verde = docente, naranja = estudiante. */
  color: 'bg-primary-soft text-primary' | 'bg-success-soft text-success' | 'bg-warning-soft text-warning';
}

const INFO_PERFIL: Record<Rol, InfoPerfil> = {
  ADMIN: { icon: BuildingIcon, color: 'bg-primary-soft text-primary' },
  COORDINADOR: { icon: ClipboardListIcon, color: 'bg-primary-soft text-primary' },
  COORDINADOR_CONVIVENCIA: { icon: EyeIcon, color: 'bg-primary-soft text-primary' },
  ORIENTADOR: { icon: EyeIcon, color: 'bg-primary-soft text-primary' },
  SECRETARIA: { icon: ClipboardListIcon, color: 'bg-primary-soft text-primary' },
  DOCENTE: { icon: GraduationCapIcon, color: 'bg-success-soft text-success' },
  ESTUDIANTE: { icon: UserIcon, color: 'bg-warning-soft text-warning' },
  ACUDIENTE: { icon: UsersIcon, color: 'bg-primary-soft text-primary' },
};

interface SelectorRolLoginProps {
  value: Rol | null;
  onChange: (rol: Rol) => void;
  disabled?: boolean;
}

/**
 * Selector del perfil con el que se entra. Una misma persona puede ser docente y acudiente a la vez: elige aquí con cuál inicia sesión
 * y el sistema la lleva a la vista de ese perfil. El servidor valida que realmente lo tenga (después de comprobar la contraseña).
 */
export function SelectorRolLogin({ value, onChange, disabled }: SelectorRolLoginProps) {
  return (
    <div>
      <p id="selector-rol-etiqueta" className="mb-1.5 text-sm font-medium text-body">
        Entrar como
      </p>
      <div role="radiogroup" aria-labelledby="selector-rol-etiqueta" className="grid grid-cols-2 gap-2">
        {ROLES.map((rol) => {
          const { icon: Icono, color } = INFO_PERFIL[rol];
          const activo = value === rol;
          return (
            <button
              key={rol}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={disabled}
              onClick={() => onChange(rol)}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                activo ? 'border-primary bg-primary-soft shadow-xs' : 'border-border bg-surface hover:border-primary/40 hover:bg-soft'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}>
                <Icono className="h-4 w-4" />
              </span>
              <span className={`min-w-0 text-sm leading-tight ${activo ? 'font-semibold text-primary' : 'font-medium text-body'}`}>{ROL_LABELS[rol]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
