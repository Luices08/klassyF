import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'outline' | 'secondary' | 'soft-edit' | 'soft-danger' | 'soft-success';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 focus-visible:outline-primary',
  outline: 'bg-white text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary-soft',
  secondary: 'bg-white text-body ring-1 ring-inset ring-border hover:bg-soft',
  'soft-edit': 'bg-primary-soft text-primary hover:bg-primary-soft/70',
  'soft-danger': 'bg-danger-soft text-danger hover:bg-danger-soft/70',
  'soft-success': 'bg-success-soft text-success hover:bg-success-soft/70',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading, className = '', children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
