import { describe, expect, it } from 'vitest';
import { generarChecklistMatricula } from '../src/constants/matriculaChecklist';

describe('Generador Dinámico de Checklist de Matrículas (M04)', () => {
  it('Preescolar: incluye vacunas, crecimiento/desarrollo y tamizaje visual/auditivo', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'PREESCOLAR',
      numeroGrado: 0,
      tipoIngreso: 'NUEVO',
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('DOCUMENTO_IDENTIDAD');
    expect(tipos).toContain('FOTO');
    expect(tipos).toContain('CARNE_EPS');
    expect(tipos).toContain('DOCUMENTO_ACUDIENTE');
    expect(tipos).toContain('CARNE_VACUNAS');
    expect(tipos).toContain('CERTIFICADO_CRECIMIENTO_DESARROLLO');
    expect(tipos).toContain('CERTIFICADO_AUDIOMETRIA_VISION');
    // Preescolar no exige notas anteriores ni SIMAT
    expect(tipos).not.toContain('CERTIFICADOS_NOTAS_ANTERIORES');
    expect(tipos).not.toContain('PAZ_Y_SALVO_SIMAT');
  });

  it('Primaria Estudiante Nuevo: exige notas anteriores y paz y salvo SIMAT', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'PRIMARIA',
      numeroGrado: 3,
      tipoIngreso: 'NUEVO',
      parentescoAcudiente: 'MADRE',
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('CERTIFICADOS_NOTAS_ANTERIORES');
    expect(tipos).toContain('PAZ_Y_SALVO_SIMAT');
    expect(tipos).not.toContain('CUSTODIA_LEGAL_O_PODER');
  });

  it('Primaria Estudiante Antiguo (Renovación): NO exige SIMAT ni notas de años anteriores', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'PRIMARIA',
      numeroGrado: 4,
      tipoIngreso: 'ANTIGUO',
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('DOCUMENTO_IDENTIDAD');
    expect(tipos).toContain('FOTO');
    expect(tipos).toContain('CARNE_EPS');
    expect(tipos).not.toContain('PAZ_Y_SALVO_SIMAT');
    expect(tipos).not.toContain('CERTIFICADOS_NOTAS_ANTERIORES');
  });

  it('Secundaria Estudiante Nuevo: exige certificado de 5° de primaria y SIMAT', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'SECUNDARIA',
      numeroGrado: 8,
      tipoIngreso: 'TRASLADO',
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('CERTIFICADO_QUINTO_PRIMARIA');
    expect(tipos).toContain('CERTIFICADOS_NOTAS_ANTERIORES');
    expect(tipos).toContain('PAZ_Y_SALVO_SIMAT');
  });

  it('Media Grado 11° por Traslado: incluye Servicio Social Obligatorio', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'MEDIA',
      numeroGrado: 11,
      tipoIngreso: 'TRASLADO',
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('SERVICIO_SOCIAL_ESTUDIANTIL');
    expect(tipos).toContain('CERTIFICADO_QUINTO_PRIMARIA');
  });

  it('Inclusión / Discapacidad: añade diagnóstico médico / valoración PIAR', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'PRIMARIA',
      numeroGrado: 2,
      tipoIngreso: 'NUEVO',
      tieneDiscapacidad: true,
    });

    const tipos = checklist.map((c) => c.tipo_documento);
    expect(tipos).toContain('DIAGNOSTICO_MEDICO_INCLUSION');
    const itemInclusion = checklist.find((c) => c.tipo_documento === 'DIAGNOSTICO_MEDICO_INCLUSION');
    expect(itemInclusion?.obligatorio).toBe(true);
  });

  it('Acudiente no Padre/Madre (p. ej. Abuelo): incluye custodia legal pero como NO obligatoria', () => {
    const checklist = generarChecklistMatricula({
      nivel: 'SECUNDARIA',
      numeroGrado: 7,
      tipoIngreso: 'NUEVO',
      parentescoAcudiente: 'ABUELO',
    });

    const itemCustodia = checklist.find((c) => c.tipo_documento === 'CUSTODIA_LEGAL_O_PODER');
    expect(itemCustodia).toBeDefined();
    // No es obligatorio para evitar bloqueos innecesarios en situaciones familiares normales
    expect(itemCustodia?.obligatorio).toBe(false);
  });
});
