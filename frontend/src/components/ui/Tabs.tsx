import type { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  /** Novedades de la pestaña (punto rojo con número); opcional. */
  contador?: number;
}

export interface TabsProps {
  items: TabItem[];
  active?: string;
  value?: string;
  onChange: (key: string) => void;
}

/** Navegación por pestañas (Klassy UI Spec): subrayado azul en la activa, sin fondo. */
export function Tabs({ items, active, value, onChange }: TabsProps) {
  const currentKey = active ?? value;
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex flex-wrap gap-4">
        {items.map((item) => {
          const isActive = item.key === currentKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-body'
              }`}
            >
              {item.label}
              {item.contador ? (
                <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white">
                  {item.contador > 99 ? '99+' : item.contador}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function TabPanel({ active, tabKey, children }: { active: string; tabKey: string; children: ReactNode }) {
  if (active !== tabKey) return null;
  return <div className="pt-4">{children}</div>;
}
