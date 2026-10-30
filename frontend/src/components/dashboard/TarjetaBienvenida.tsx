import type { ComponentType, SVGProps } from 'react';
import { Card } from '../ui/Card';

interface TarjetaBienvenidaProps {
  /** Nombre completo de quien entra: va grande, debajo de «Hola,». */
  nombre: string;
  /** El mensaje personalizado según el perfil. */
  texto: string;
  /** Un dato corto y real de la persona (su grado y grupo, cuántos grupos tiene…); sin dato no se dibuja. */
  ficha?: { icono: ComponentType<SVGProps<SVGSVGElement>>; texto: string } | null;
}

/**
 * La bienvenida del inicio de docentes, estudiantes y acudientes: «Hola,», el nombre, un mensaje según el perfil y una ficha con un dato de la persona. De fondo, la
 * ilustración de libros con un velo azul claro (`primary-soft`) que se desvanece hacia la derecha, para que el texto se lea y la ilustración quede a la vista.
 * El escudo y el nombre del colegio no van aquí: están en la barra superior.
 */
export function TarjetaBienvenida({ nombre, texto, ficha }: TarjetaBienvenidaProps) {
  const Icono = ficha?.icono;
  return (
    <Card className="relative isolate flex min-h-56 flex-col justify-center overflow-hidden border-primary/10 p-6 sm:p-8">
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-right" style={{ backgroundImage: 'url(/bienvenida-libros.jpg)' }} />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-primary-soft via-primary-soft/90 to-primary-soft/30 sm:via-primary-soft/75" />

      <div className="max-w-md">
        <p className="text-body text-body">Hola,</p>
        <h1 className="text-h2 text-ink sm:text-h1">{nombre}</h1>
        <p className="mt-3 text-body text-body">{texto}</p>
        {ficha && Icono && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface/80 px-4 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/15">
            <Icono className="h-[18px] w-[18px]" />
            {ficha.texto}
          </p>
        )}
      </div>
    </Card>
  );
}
