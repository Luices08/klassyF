import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, forwardRef } from 'react';

const baseFieldClasses =
  'block w-full rounded-md border-0 py-1.5 px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:bg-slate-100 disabled:text-slate-500';

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function FieldWrapper({ label, htmlFor, error, hint, children }: FieldWrapperProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? label;
    return (
      <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
        <input ref={ref} id={fieldId} className={`${baseFieldClasses} ${className}`} {...rest} />
      </FieldWrapper>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, id, className = '', children, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? label;
    return (
      <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
        <select ref={ref} id={fieldId} className={`${baseFieldClasses} bg-white ${className}`} {...rest}>
          {children}
        </select>
      </FieldWrapper>
    );
  }
);
Select.displayName = 'Select';
