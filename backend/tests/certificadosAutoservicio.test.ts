import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
});

import { ROLES } from '../src/constants/roles';
import { ConfiguracionCertificadosDocument } from '../src/models/configuracionCertificados.model';
import { UserDocument } from '../src/models/user.model';
import { entradaDeElementos } from '../src/services/certificadoConfiguracion.service';
import { resolverElementos } from '../src/utils/certificados';

const config = (delegada: boolean) =>
  ({ permitir_firma_rectoria_a_secretaria: delegada, rectoria: { usuario_id: 'r' }, secretaria: { usuario_id: 's' } }) as unknown as ConfiguracionCertificadosDocument;
const acudiente = { rol: ROLES.ACUDIENTE } as UserDocument;
const hayImagen = { rectoria: true, secretaria: true, sello: true };

describe('firmas de un certificado de autoservicio (M27 → M26)', () => {
  it('con Rectoría OPCIONAL_ENCENDIDO y sin delegación, no se estampa pero el documento sale', () => {
    const politica = { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' } as const;
    const { aplicados, errores } = resolverElementos(entradaDeElementos(config(false), politica, acudiente, hayImagen, true), {});
    expect(errores).toEqual([]);
    expect(aplicados).toEqual({ rectoria: false, secretaria: true, sello: true });
  });

  it('con la delegación encendida, Rectoría se estampa por política', () => {
    const politica = { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'NO_APLICA', sello: 'OPCIONAL_APAGADO' } as const;
    const { aplicados } = resolverElementos(entradaDeElementos(config(true), politica, acudiente, hayImagen, true), {});
    expect(aplicados).toEqual({ rectoria: true, secretaria: false, sello: false });
  });

  it('si Rectoría es obligatoria y no hay delegación, no se expide solo (hay que pedirlo en secretaría)', () => {
    const politica = { rectoria: 'OBLIGATORIO', secretaria: 'NO_APLICA', sello: 'NO_APLICA' } as const;
    const { errores } = resolverElementos(entradaDeElementos(config(false), politica, acudiente, hayImagen, true), {});
    expect(errores.length).toBe(1);
  });

  it('un acudiente en el flujo normal (no autoservicio) nunca estampa la firma de Rectoría', () => {
    const politica = { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'NO_APLICA', sello: 'NO_APLICA' } as const;
    const { aplicados } = resolverElementos(entradaDeElementos(config(true), politica, acudiente, hayImagen), {});
    expect(aplicados.rectoria).toBe(false);
  });
});
