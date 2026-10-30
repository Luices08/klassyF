import { type ComponentType, type KeyboardEvent, type SVGProps, useEffect, useRef, useState } from 'react';
import type { Rol } from '../../types/api';
import { ROLES } from '../../types/api';
import { ROL_LABELS } from '../ui/Badge';
import { BuildingIcon, CheckIcon, ChevronDownIcon, ClipboardListIcon, EyeIcon, GraduationCapIcon, UserIcon, UsersIcon } from '../ui/icons';

const ICONO_PERFIL: Record<Rol, ComponentType<SVGProps<SVGSVGElement>>> = {
  ADMIN: UserIcon,
  COORDINADOR: BuildingIcon,
  COORDINADOR_CONVIVENCIA: EyeIcon,
  ORIENTADOR: EyeIcon,
  SECRETARIA: ClipboardListIcon,
  DOCENTE: GraduationCapIcon,
  ESTUDIANTE: UserIcon,
  ACUDIENTE: UsersIcon,
};

interface SelectorRolLoginProps {
  value: Rol | null;
  onChange: (rol: Rol) => void;
  disabled?: boolean;
}

/**
 * Selector desplegable del perfil con el que se entra. Una misma persona puede ser docente y acudiente a la vez: elige aquí con cuál inicia sesión
 * y el sistema la lleva a la vista de ese perfil. El servidor valida que realmente lo tenga (después de comprobar la contraseña).
 * Teclado: flechas para moverse, Enter o espacio para elegir, Escape para cerrar.
 */
export function SelectorRolLogin({ value, onChange, disabled }: SelectorRolLoginProps) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alHacerClic = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alHacerClic);
    return () => document.removeEventListener('mousedown', alHacerClic);
  }, [abierto]);

  function abrir() {
    if (disabled) return;
    setResaltado(Math.max(0, value ? ROLES.indexOf(value) : 0));
    setAbierto(true);
  }

  function elegir(rol: Rol) {
    onChange(rol);
    setAbierto(false);
  }

  function alPulsar(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape') {
      setAbierto(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) return abrir();
      setResaltado((i) => (e.key === 'ArrowDown' ? (i + 1) % ROLES.length : (i - 1 + ROLES.length) % ROLES.length));
    } else if ((e.key === 'Enter' || e.key === ' ') && abierto) {
      e.preventDefault();
      elegir(ROLES[resaltado] as Rol);
    }
  }

  const Icono = value ? ICONO_PERFIL[value] : UserIcon;

  return (
    <div ref={raiz} className="relative">
      <span id="selector-rol-etiqueta" className="mb-1.5 block text-label text-body">
        Rol
      </span>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls="selector-rol-lista"
        aria-labelledby="selector-rol-etiqueta"
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={alPulsar}
        className={`flex w-full items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${
          abierto ? 'border-primary' : 'border-border hover:border-primary/40'
        }`}
      >
        <Icono className={`h-[18px] w-[18px] shrink-0 ${value ? 'text-primary' : 'text-muted'}`} />
        <span className={`flex-1 truncate ${value ? 'font-medium text-primary' : 'text-muted'}`}>{value ? ROL_LABELS[value] : 'Elige tu perfil'}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <ul
          id="selector-rol-lista"
          role="listbox"
          aria-labelledby="selector-rol-etiqueta"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {ROLES.map((rol, i) => {
            const ItemIcono = ICONO_PERFIL[rol];
            const elegido = value === rol;
            return (
              <li
                key={rol}
                role="option"
                aria-selected={elegido}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(rol)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  elegido ? 'bg-primary-soft font-medium text-primary' : resaltado === i ? 'bg-soft text-ink' : 'text-body'
                }`}
              >
                <ItemIcono className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{ROL_LABELS[rol]}</span>
                {elegido && <CheckIcon className="h-4 w-4 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
