export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}

/** Selector de pestañas: subrayado azul en la activa, texto secundario en el resto. */
export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="flex gap-6 border-b border-border">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
              active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-body'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
