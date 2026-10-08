import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Chip } from './Badge';
import { ChevronDownIcon } from './icons';

export interface MultiSelectOption<T extends string = string> {
  value: T;
  label: string;
  badge?: ReactNode;
}

export interface MultiSelectProps<T extends string = string> {
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  placeholder?: string;
  allLabel?: string;
  /** Texto cuando no hay nada elegido y elegir es obligatorio (si se omite, se muestra `allLabel`, como siempre). */
  emptyLabel?: string;
  className?: string;
}

export function MultiSelect<T extends string = string>({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Seleccionar...',
  allLabel = 'Todos',
  emptyLabel,
  className = '',
}: MultiSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function toggleOption(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function handleSelectAll() {
    onChange(options.map((o) => o.value));
  }

  function handleClear() {
    onChange([]);
  }

  // Resumen textual para el botón
  const selectedOptions = options.filter((o) => selected.includes(o.value));
  let triggerText = allLabel;
  if (selectedOptions.length === 1) {
    triggerText = selectedOptions[0].label;
  } else if (selectedOptions.length === 2) {
    triggerText = `${selectedOptions[0].label}, ${selectedOptions[1].label}`;
  } else if (selectedOptions.length > 2) {
    if (selectedOptions.length === options.length) {
      triggerText = allLabel;
    } else {
      triggerText = `${selectedOptions[0].label} +${selectedOptions.length - 1}`;
    }
  }

  const isAllSelected = selectedOptions.length === options.length && options.length > 0;
  const isNoneSelected = selectedOptions.length === 0;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <label className="mb-1.5 block text-label text-body">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm text-ink ring-1 ring-inset ring-border transition-colors hover:bg-soft/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
      >
        <span className={`truncate ${isNoneSelected || isAllSelected ? 'text-muted' : 'font-medium text-ink'}`}>
          {isNoneSelected ? (emptyLabel ?? allLabel ?? placeholder) : triggerText}
        </span>

        <div className="flex items-center gap-1.5">
          {!isNoneSelected && !isAllSelected && (
            <Chip tone="blue">{selected.length}</Chip>
          )}
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-max min-w-full rounded-xl border border-border bg-surface p-2 shadow-lg ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <span className="font-semibold text-muted">
              {selected.length} de {options.length} seleccionados
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="font-semibold text-primary hover:underline focus:outline-none"
              >
                Todos
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={handleClear}
                className="font-semibold text-muted hover:text-danger focus:outline-none"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="my-1.5 border-t border-border" />

          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {options.map((opt) => {
              const isChecked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-soft select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt.value)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                    />
                    <span className={`text-sm ${isChecked ? 'font-semibold text-ink' : 'text-body'}`}>
                      {opt.label}
                    </span>
                  </div>
                  {opt.badge && <div className="shrink-0">{opt.badge}</div>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
