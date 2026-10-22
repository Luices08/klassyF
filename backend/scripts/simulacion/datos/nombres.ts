import { Azar } from '../nucleo/azar';

// Nombres y apellidos frecuentes en Colombia (Registraduría y listados públicos de nombres más comunes).
const NOMBRES_F = [
  'María', 'Valentina', 'Sofía', 'Isabella', 'Mariana', 'Gabriela', 'Daniela', 'Valeria', 'Camila', 'Sara', 'Luciana', 'Salomé',
  'Antonella', 'Paula', 'Juliana', 'Natalia', 'Laura', 'Andrea', 'Carolina', 'Manuela', 'Emily', 'Samantha', 'Ana', 'Lucía',
  'Martina', 'Alejandra', 'Ximena', 'Victoria', 'Emma', 'Danna', 'Luna', 'Zoe', 'Allison', 'Melany', 'Nicol', 'Karen', 'Angie',
  'Paola', 'Diana', 'Catalina', 'Juana', 'Abigail', 'Hanna', 'Florencia', 'Miranda', 'Violeta', 'Josefina', 'Renata', 'Ángela',
  'Leidy', 'Yuliana', 'Tatiana', 'Marcela', 'Sandra', 'Adriana', 'Liliana', 'Claudia', 'Patricia', 'Gloria', 'Luz',
];
const NOMBRES_M = [
  'Santiago', 'Samuel', 'Matías', 'Sebastián', 'Alejandro', 'Nicolás', 'Juan', 'Daniel', 'David', 'Jerónimo', 'Martín', 'Tomás',
  'Emiliano', 'Gabriel', 'Miguel', 'Andrés', 'Felipe', 'José', 'Luis', 'Carlos', 'Esteban', 'Mateo', 'Thiago', 'Maximiliano',
  'Simón', 'Emmanuel', 'Isaac', 'Joaquín', 'Benjamín', 'Julián', 'Diego', 'Camilo', 'Kevin', 'Brayan', 'Jhon', 'Cristian',
  'Johan', 'Óscar', 'Jorge', 'Fernando', 'Ricardo', 'Mauricio', 'Héctor', 'Álvaro', 'Iván', 'Wilson', 'Hernán', 'Fabián',
  'Elkin', 'Arley', 'Duván', 'Yeison', 'Stiven', 'Dylan', 'Ángel', 'Pablo', 'Manuel', 'Ramiro', 'Edwin', 'Germán',
];
const APELLIDOS = [
  'Rodríguez', 'Gómez', 'González', 'Martínez', 'García', 'López', 'Hernández', 'Sánchez', 'Ramírez', 'Pérez', 'Díaz', 'Muñoz',
  'Rojas', 'Moreno', 'Jiménez', 'Torres', 'Álvarez', 'Ruiz', 'Vargas', 'Castro', 'Romero', 'Suárez', 'Ortiz', 'Herrera',
  'Gutiérrez', 'Restrepo', 'Ospina', 'Castaño', 'Valencia', 'Cardona', 'Mejía', 'Zapata', 'Arango', 'Giraldo', 'Quintero',
  'Osorio', 'Salazar', 'Ríos', 'Marín', 'Franco', 'Medina', 'Cárdenas', 'Mendoza', 'Parra', 'Acosta', 'Peña', 'Correa',
  'Molina', 'Aguirre', 'Bermúdez', 'Cortés', 'Caicedo', 'Ramos', 'Vásquez', 'Contreras', 'Patiño', 'Duque', 'Montoya',
  'Navarro', 'Rincón', 'Becerra', 'Guerrero', 'Sierra', 'Pineda', 'Bedoya', 'Escobar', 'Mosquera', 'Palacios', 'Cuesta',
  'Hurtado', 'Benítez', 'Rivera', 'Chávez', 'Fonseca', 'Barrera', 'Cifuentes', 'León', 'Pacheco', 'Villamizar', 'Uribe',
  'Lozano', 'Nieto', 'Arias', 'Cruz', 'Delgado', 'Rueda', 'Mora', 'Prieto', 'Camacho', 'Bautista', 'Sandoval', 'Rangel',
];
const BARRIOS = ['Centro', 'La Concordia', 'San Alonso', 'Provenza', 'El Prado', 'La Victoria', 'Los Pinos', 'Villa del Rosario', 'El Jardín', 'Campo Hermoso', 'La Joya', 'San Francisco'];
const EPS = ['Nueva EPS', 'Sanitas', 'Sura', 'Salud Total', 'Famisanar', 'Coosalud', 'Compensar', 'Mutual Ser'];

export type Genero = 'M' | 'F';

export interface NombreCompleto {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string;
  nombre: string;
  apellido: string;
}

export function nombreAleatorio(azar: Azar, genero: Genero, apellidos?: { primer: string; segundo?: string }): NombreCompleto {
  const lista = genero === 'F' ? NOMBRES_F : NOMBRES_M;
  const primer_nombre = azar.elegir(lista);
  let segundo_nombre: string | null = null;
  if (azar.prob(0.55)) {
    do segundo_nombre = azar.elegir(lista);
    while (segundo_nombre === primer_nombre);
  }
  const primer_apellido = apellidos?.primer ?? azar.elegir(APELLIDOS);
  const segundo_apellido = apellidos?.segundo ?? azar.elegir(APELLIDOS);
  return {
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido,
    nombre: segundo_nombre ? `${primer_nombre} ${segundo_nombre}` : primer_nombre,
    apellido: `${primer_apellido} ${segundo_apellido}`,
  };
}

export function apellidoAleatorio(azar: Azar): string {
  return azar.elegir(APELLIDOS);
}

export function barrioAleatorio(azar: Azar): string {
  return azar.elegir(BARRIOS);
}

export function epsAleatoria(azar: Azar): string {
  return azar.elegir(EPS);
}

/** Correo sin tildes ni espacios: `ana.perez.1234@sim.klassy.co`. */
export function correoDe(nombre: string, apellido: string, sufijo: string | number, dominio: string): string {
  const limpio = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, '')
      .slice(0, 12);
  return `${limpio(nombre.split(' ')[0] ?? 'x')}.${limpio(apellido.split(' ')[0] ?? 'x')}.${sufijo}@${dominio}`;
}
