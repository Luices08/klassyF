import { type ComponentType, type InputHTMLAttributes, type ReactNode, type SVGProps, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';

export const baseFieldClasses =
  'block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted';

interface FieldWrapperProps {
  label: string;
  /** Oculta la etiqueta a la vista (sigue disponible para lectores de pantalla): filas repetidas con encabezado común. */
  hideLabel?: boolean;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function FieldWrapper({ label, hideLabel, htmlFor, error, hint, children }: FieldWrapperProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-label text-body'}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  /** Un icono dentro del campo, a la izquierda (p. ej. el de documento en el login). */
  iconoInicial?: ComponentType<SVGProps<SVGSVGElement>>;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hideLabel, error, hint, id, className = '', iconoInicial: IconoInicial, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? label;
    const campo = <input ref={ref} id={fieldId} className={`${baseFieldClasses} ${IconoInicial ? 'pl-10' : ''} ${className}`} {...rest} />;
    return (
      <FieldWrapper label={label} hideLabel={hideLabel} htmlFor={fieldId} error={error} hint={hint}>
        {IconoInicial ? (
          <div className="relative">
            <IconoInicial aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-primary/70" />
            {campo}
          </div>
        ) : (
          campo
        )}
      </FieldWrapper>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hideLabel, error, hint, id, className = '', children, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? label;
    return (
      <FieldWrapper label={label} hideLabel={hideLabel} htmlFor={fieldId} error={error} hint={hint}>
        <select ref={ref} id={fieldId} className={`${baseFieldClasses} bg-white ${className}`} {...rest}>
          {children}
        </select>
      </FieldWrapper>
    );
  }
);
Select.displayName = 'Select';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hideLabel, error, hint, id, className = '', rows = 3, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? label;
    return (
      <FieldWrapper label={label} hideLabel={hideLabel} htmlFor={fieldId} error={error} hint={hint}>
        <textarea ref={ref} id={fieldId} rows={rows} className={`${baseFieldClasses} ${className}`} {...rest} />
      </FieldWrapper>
    );
  }
);
Textarea.displayName = 'Textarea';
