import { type InputHTMLAttributes, forwardRef, useState } from 'react';
import { FieldWrapper, baseFieldClasses } from './Field';
import { EyeIcon, EyeOffIcon } from './icons';

interface CampoContrasenaProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  hint?: string;
}

/** Un `Input` de contraseña con el ojito para verla u ocultarla. El valor sigue siendo del formulario; esto solo cambia cómo se dibuja. */
export const CampoContrasena = forwardRef<HTMLInputElement, CampoContrasenaProps>(({ label, error, hint, id, className = '', ...rest }, ref) => {
  const [visible, setVisible] = useState(false);
  const fieldId = id ?? rest.name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <div className="relative">
        <input ref={ref} id={fieldId} type={visible ? 'text' : 'password'} className={`${baseFieldClasses} pr-10 ${className}`} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        >
          {visible ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </FieldWrapper>
  );
});
CampoContrasena.displayName = 'CampoContrasena';
