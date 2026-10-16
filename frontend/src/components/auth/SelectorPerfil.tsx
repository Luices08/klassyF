import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import { ROL_LABELS } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ArrowLeftIcon, BuildingIcon, ChevronDownIcon, ClipboardListIcon, EyeIcon, GraduationCapIcon, UserIcon, UsersIcon } from '../ui/icons';

interface InfoPerfil {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  descripcion: string;
  /** Familias de color de la guía visual: azul = administrativo, verde = docente, naranja = estudiante. */
  color: 'bg-primary-soft text-primary' | 'bg-success-soft text-success' | 'bg-warning-soft text-warning';
}

const INFO_PERFIL: Record<Rol, InfoPerfil> = {
  ADMIN: { icon: BuildingIcon, descripcion: 'Configuración y administración de la institución', color: 'bg-primary-soft text-primary' },
  COORDINADOR: { icon: ClipboardListIcon, descripcion: 'Seguimiento académico, horarios y planeación', color: 'bg-primary-soft text-primary' },
  COORDINADOR_CONVIVENCIA: { icon: EyeIcon, descripcion: 'Casos de convivencia y comité', color: 'bg-primary-soft text-primary' },
  ORIENTADOR: { icon: EyeIcon, descripcion: 'Orientación escolar e inclusión', color: 'bg-primary-soft text-primary' },
  SECRETARIA: { icon: ClipboardListIcon, descripcion: 'Matrículas, admisiones y certificados', color: 'bg-primary-soft text-primary' },
  DOCENTE: { icon: GraduationCapIcon, descripcion: 'Tus clases: planeación, asistencia y notas', color: 'bg-success-soft text-success' },
  ESTUDIANTE: { icon: UserIcon, descripcion: 'Tus notas, actividades y observador', color: 'bg-warning-soft text-warning' },
  ACUDIENTE: { icon: UsersIcon, descripcion: 'Notas, asistencia, documentos y certificados de tus estudiantes a cargo', color: 'bg-primary-soft text-primary' },
};

interface SelectorPerfilProps {
  nombre: string;
  perfiles: Rol[];
  /** Perfil que se está abriendo (deshabilita el resto mientras responde el servidor). */
  abriendo: Rol | null;
  onElegir: (rol: Rol) => void;
  onVolver: () => void;
}

/**
 * Se muestra después de validar la contraseña cuando la persona tiene más de un perfil (p. ej. docente y acudiente a la vez).
 * Un solo registro, un solo documento: aquí solo elige con cuál de sus perfiles entra.
 */
export function SelectorPerfil({ nombre, perfiles, abriendo, onElegir, onVolver }: SelectorPerfilProps) {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-xs">
      <div className="text-center">
        <h2 className="text-h3 text-ink">Hola, {nombre}</h2>
        <p className="mt-1 text-sm text-muted">Tu usuario tiene más de un perfil. ¿Con cuál quieres entrar?</p>
      </div>

      <ul className="space-y-3">
        {perfiles.map((rol) => {
          const { icon: Icono, descripcion, color } = INFO_PERFIL[rol];
          return (
            <li key={rol}>
              <button
                type="button"
                disabled={abriendo !== null}
                onClick={() => onElegir(rol)}
                className="group flex w-full items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${color}`}>
                  <Icono className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{abriendo === rol ? 'Entrando…' : ROL_LABELS[rol]}</span>
                  <span className="mt-0.5 block text-xs text-muted">{descripcion}</span>
                </span>
                <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-muted transition-colors group-hover:text-primary" />
              </button>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="secondary" onClick={onVolver} disabled={abriendo !== null} className="w-full">
        <ArrowLeftIcon className="h-4 w-4" />
        Usar otro usuario
      </Button>
    </div>
  );
}
