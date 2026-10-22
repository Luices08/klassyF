import { describe, expect, it } from 'vitest';
import { armarCorreoBoletin, armarCorreoInasistencia } from '../src/utils/correoAvisos';

const base = { institucion: 'Colegio <Demo>', acudiente: 'Ana "Pérez"', estudiante: 'Luis', enlace: 'https://colegio.edu.co/portal' };

describe('correo de boletín publicado', () => {
  it('dice el periodo y el estudiante, y lleva el enlace al portal', () => {
    const c = armarCorreoBoletin({ ...base, periodo: 2 });
    expect(c.asunto).toBe('Boletín del periodo 2 disponible: Luis');
    expect(c.texto).toContain('El boletín del periodo 2 de Luis ya está publicado');
    expect(c.texto).toContain('https://colegio.edu.co/portal');
    expect(c.html).toContain('href="https://colegio.edu.co/portal"');
  });

  it('escapa lo que escribe una persona y no inventa un botón sin enlace', () => {
    const c = armarCorreoBoletin({ ...base, periodo: 1, enlace: null });
    expect(c.html).toContain('Ana &quot;Pérez&quot;');
    expect(c.html).toContain('Colegio &lt;Demo&gt;');
    expect(c.html).not.toContain('Ir al portal');
    expect(c.texto).not.toContain('Ingresa al portal');
  });
});

describe('correo de inasistencia sin excusa', () => {
  it('lista las asignaturas del día y pide comunicar la excusa', () => {
    const c = armarCorreoInasistencia({ ...base, dia: 'Martes, 3 de marzo de 2026', asignaturas: ['Matemáticas', 'Inglés'] });
    expect(c.asunto).toBe('Inasistencia sin excusa de Luis');
    expect(c.texto).toContain('Luis no asistió el Martes, 3 de marzo de 2026 a:');
    expect(c.texto).toContain('- Matemáticas');
    expect(c.texto).toContain('- Inglés');
    expect(c.texto).toContain('excusa válida');
    expect(c.html).toContain('<li>Matemáticas</li>');
  });

  it('escapa los nombres de asignatura', () => {
    const c = armarCorreoInasistencia({ ...base, dia: 'Lunes', asignaturas: ['<b>Arte</b>'] });
    expect(c.html).toContain('&lt;b&gt;Arte&lt;/b&gt;');
    expect(c.html).not.toContain('<b>Arte</b>');
  });
});
