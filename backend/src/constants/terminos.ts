import { Rol } from './enums';

// Texto de partida redactado con la normativa colombiana citada; debe revisarlo el asesor jurídico del colegio antes de usarse en producción.

export const TIPOS_TERMINOS = ['GENERAL', 'DOCENTE', 'ESTUDIANTE', 'ADMINISTRATIVO'] as const;
export type TipoTerminos = (typeof TIPOS_TERMINOS)[number];

export interface SeccionTerminos {
  titulo: string;
  parrafos: string[];
}

export interface DocumentoTerminos {
  tipo: TipoTerminos;
  titulo: string;
  /** Al cambiar el texto se sube la versión: quien aceptó una anterior debe aceptar de nuevo. */
  version: string;
  vigente_desde: string;
  introduccion: string;
  secciones: SeccionTerminos[];
}

/** El acudiente comparte los términos del estudiante: actúa en su nombre y sobre sus datos. */
export const TERMINOS_POR_ROL: Record<Rol, TipoTerminos> = {
  ADMIN: 'ADMINISTRATIVO',
  COORDINADOR: 'ADMINISTRATIVO',
  COORDINADOR_CONVIVENCIA: 'ADMINISTRATIVO',
  ORIENTADOR: 'ADMINISTRATIVO',
  SECRETARIA: 'ADMINISTRATIVO',
  DOCENTE: 'DOCENTE',
  ESTUDIANTE: 'ESTUDIANTE',
  ACUDIENTE: 'ESTUDIANTE',
};

const GENERAL: DocumentoTerminos = {
  tipo: 'GENERAL',
  titulo: 'Términos y condiciones de uso',
  version: '1.0',
  vigente_desde: '2026-10-29',
  introduccion:
    'Estos términos regulan el acceso y el uso de la plataforma Klassy de {institucion}. Al hacer clic en «Aceptar y continuar» declara que los leyó, que los entiende y que los acepta. Si no los acepta, no podrá ingresar a la plataforma.',
  secciones: [
    {
      titulo: '1. Objeto',
      parrafos: [
        'Klassy es el sistema de gestión académica y administrativa que {institucion} pone a disposición de su comunidad educativa para la matrícula, la evaluación, la asistencia, la convivencia, la comunicación con las familias y la expedición de documentos, entre otros servicios.',
        'La plataforma es una herramienta de apoyo. No reemplaza el Proyecto Educativo Institucional (PEI), el Sistema Institucional de Evaluación de los Estudiantes (SIEE) ni el Manual de Convivencia, que siguen siendo las normas que rigen la vida escolar.',
      ],
    },
    {
      titulo: '2. Responsable del servicio y de los datos',
      parrafos: [
        '{institucion} es la responsable del tratamiento de los datos personales que se registran en la plataforma. Cada instalación de Klassy pertenece a una sola institución y su información no se comparte con otros colegios.',
      ],
    },
    {
      titulo: '3. Cuentas de usuario',
      parrafos: [
        'El acceso es personal e intransferible. Se ingresa con el número de documento de identidad y una contraseña que el usuario debe mantener en reserva y cambiar cuando el sistema lo solicite.',
        'Toda acción realizada con una cuenta se entiende hecha por su titular. Si sospecha que alguien conoce su contraseña, cámbiela de inmediato e informe a la secretaría de la institución.',
        'Al usar un equipo compartido o público, cierre la sesión al terminar.',
      ],
    },
    {
      titulo: '4. Uso permitido',
      parrafos: [
        'La plataforma solo puede usarse con fines académicos, administrativos y de comunicación institucional.',
        'Está prohibido: suplantar a otra persona; intentar acceder a información o funciones para las que no se tiene permiso; cargar archivos con virus o contenido ilegal, ofensivo o que vulnere derechos de terceros; copiar o extraer información de forma masiva; y alterar, dañar o sobrecargar el funcionamiento del sistema.',
      ],
    },
    {
      titulo: '5. Tratamiento de datos personales',
      parrafos: [
        'Los datos se tratan conforme a la Ley 1581 de 2012 y sus decretos reglamentarios (compilados en el Decreto 1074 de 2015), con las finalidades propias del servicio educativo: matrícula y registro escolar, evaluación y promoción, control de asistencia, seguimiento de convivencia y bienestar, atención de necesidades educativas, comunicación con las familias, expedición de certificados y reportes a las autoridades educativas (por ejemplo, SIMAT y DANE).',
        'Como titular usted puede conocer, actualizar y rectificar sus datos, solicitar prueba de la autorización, ser informado del uso que se les da, presentar quejas ante la Superintendencia de Industria y Comercio y, cuando proceda, revocar la autorización o pedir la supresión de los datos. Las solicitudes se presentan por escrito ante la secretaría de la institución.',
        'Algunos datos deben conservarse aunque el titular lo pida, porque la ley exige guardarlos como parte del registro escolar (por ejemplo, el Libro de Matrícula, las calificaciones y los certificados expedidos).',
      ],
    },
    {
      titulo: '6. Niñas, niños y adolescentes',
      parrafos: [
        'La mayoría de los estudiantes son menores de edad. Sus datos se tratan respetando el interés superior del menor y sus derechos fundamentales, conforme a la Ley 1098 de 2006 (Código de la Infancia y la Adolescencia) y la Ley 1581 de 2012.',
        'Los datos sensibles (salud, discapacidad, situaciones de convivencia y orientación psicosocial) tienen acceso restringido: solo los consultan las personas que, por su función, los necesitan, y no se usan para fines distintos a la protección y el acompañamiento del estudiante.',
      ],
    },
    {
      titulo: '7. Seguridad y registro de actividad',
      parrafos: [
        'La institución aplica medidas técnicas y administrativas razonables para proteger la información. Las acciones importantes (cambios de notas, matrículas, expedición de documentos, consultas de información reservada, entre otras) quedan registradas con el usuario, la fecha y la hora, y ese registro puede usarse para verificar lo ocurrido.',
      ],
    },
    {
      titulo: '8. Documentos expedidos por la plataforma',
      parrafos: [
        'Los certificados y constancias llevan un código y un mecanismo de verificación (código QR y clave) que permite confirmar su autenticidad en la propia plataforma. Esto no constituye una firma digital certificada en los términos de la Ley 527 de 1999.',
      ],
    },
    {
      titulo: '9. Propiedad intelectual',
      parrafos: [
        'El software Klassy, su diseño y su código están protegidos por las normas de derechos de autor. Los contenidos que publiquen la institución, los docentes y los estudiantes pertenecen a sus autores; su carga en la plataforma no transfiere esos derechos, pero autoriza su uso dentro de la institución con fines educativos.',
      ],
    },
    {
      titulo: '10. Disponibilidad y responsabilidad',
      parrafos: [
        'La institución procura que la plataforma esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallas técnicas o causas ajenas. En esos casos, los plazos académicos se ajustarán según lo que decidan las directivas.',
        'La información que muestra la plataforma mientras un periodo está abierto (por ejemplo, notas provisionales) puede cambiar. Los resultados oficiales son los que la institución cierra y publica conforme al SIEE.',
      ],
    },
    {
      titulo: '11. Cambios en estos términos',
      parrafos: [
        'La institución puede actualizar estos términos. Cuando lo haga, la plataforma mostrará la nueva versión y pedirá aceptarla de nuevo antes de continuar.',
      ],
    },
    {
      titulo: '12. Ley aplicable',
      parrafos: ['Estos términos se rigen por las leyes de la República de Colombia.'],
    },
  ],
};

const DOCENTE: DocumentoTerminos = {
  tipo: 'DOCENTE',
  titulo: 'Términos y condiciones para docentes',
  version: '1.0',
  vigente_desde: '2026-10-29',
  introduccion:
    'Además de los términos generales, quien ingresa con el perfil de docente acepta las siguientes condiciones sobre el manejo de la información académica y personal de los estudiantes de {institucion}.',
  secciones: [
    {
      titulo: '1. Veracidad y oportunidad de los registros',
      parrafos: [
        'Las calificaciones, la asistencia, las observaciones y los planes que registre deben ser veraces, completos y oportunos, y corresponder a lo que establecen el Decreto 1290 de 2009 y el SIEE de la institución.',
        'Debe digitar la información dentro de los plazos que fije la institución. Toda modificación de una nota queda registrada con su valor anterior, el nuevo, el usuario y la fecha.',
      ],
    },
    {
      titulo: '2. Confidencialidad',
      parrafos: [
        'La información de los estudiantes que conozca por la plataforma (datos personales, notas, observaciones, ajustes razonables y situaciones de convivencia) es reservada. Solo puede usarla para el ejercicio de su labor y no puede divulgarla a terceros, ni siquiera a otros estudiantes o familias.',
        'La información sobre inclusión y planes de apoyo (Decreto 1421 de 2017) y la de convivencia escolar (Ley 1620 de 2013) se le muestra solo en la medida en que la necesita para acompañar al estudiante; no debe copiarla ni comentarla fuera de los espacios institucionales.',
      ],
    },
    {
      titulo: '3. Uso de la cuenta',
      parrafos: [
        'No comparta su contraseña ni permita que otra persona (incluidos estudiantes o monitores) registre notas o asistencia con su cuenta.',
        'Cierre la sesión en los equipos de la sala de profesores, aulas o equipos compartidos.',
      ],
    },
    {
      titulo: '4. Contenidos que publica',
      parrafos: [
        'Las actividades, materiales, enlaces, comentarios y noticias que publique deben ser adecuados para menores de edad, respetar los derechos de autor y relacionarse con su labor académica.',
        'Las fotografías o videos en los que aparezcan estudiantes solo se publican cuando la institución cuenta con la autorización correspondiente.',
      ],
    },
    {
      titulo: '5. Comunicación con estudiantes y familias',
      parrafos: [
        'Use los canales institucionales de la plataforma (comentarios de actividades, citaciones, observaciones) de forma respetuosa y profesional. No use la plataforma para asuntos personales.',
      ],
    },
    {
      titulo: '6. Archivos descargados',
      parrafos: [
        'Las planillas en Excel, los listados y los PDF que descargue contienen datos personales de menores. Guárdelos solo en equipos de confianza, no los envíe por canales no institucionales y elimínelos cuando ya no los necesite.',
      ],
    },
    {
      titulo: '7. Incumplimiento',
      parrafos: [
        'El uso indebido de la plataforma o de la información puede dar lugar a la suspensión del acceso y a las acciones que prevean el reglamento interno de la institución, el contrato o el régimen disciplinario que le sea aplicable, sin perjuicio de las responsabilidades legales.',
      ],
    },
  ],
};

const ESTUDIANTE: DocumentoTerminos = {
  tipo: 'ESTUDIANTE',
  titulo: 'Términos y condiciones para estudiantes y acudientes',
  version: '1.0',
  vigente_desde: '2026-10-29',
  introduccion:
    'Además de los términos generales, quien ingresa como estudiante o como acudiente de un estudiante de {institucion} acepta las siguientes condiciones. Si el estudiante es menor de edad, se recomienda que su acudiente lea estos términos con él.',
  secciones: [
    {
      titulo: '1. Cuenta personal',
      parrafos: [
        'Su cuenta es solo suya. No preste su contraseña a compañeros ni a otras personas y no ingrese con la cuenta de otro.',
        'El acudiente tiene su propia cuenta y no debe usar la del estudiante, ni el estudiante la del acudiente.',
      ],
    },
    {
      titulo: '2. Honestidad académica',
      parrafos: [
        'Las tareas y trabajos que entregue por la plataforma deben ser de su autoría. Copiar trabajos de otros, presentar como propio contenido ajeno o hacer entregas en nombre de otro estudiante son faltas que se tratan según el Manual de Convivencia y el SIEE.',
      ],
    },
    {
      titulo: '3. Convivencia en la plataforma',
      parrafos: [
        'Los comentarios y mensajes deben ser respetuosos. Las burlas, insultos, amenazas, la difusión de información de otros o cualquier forma de acoso escolar o ciberacoso se atienden conforme a la Ley 1620 de 2013 y al Manual de Convivencia, igual que si ocurrieran en el colegio.',
      ],
    },
    {
      titulo: '4. Información académica que consulta',
      parrafos: [
        'Mientras un periodo está abierto, las notas que ve pueden ser provisionales. Los resultados oficiales son los del boletín que la institución publica.',
        'Si no está de acuerdo con una calificación, siga el procedimiento de reclamación del SIEE de la institución; la plataforma informa, pero no reemplaza ese procedimiento.',
      ],
    },
    {
      titulo: '5. Responsabilidades del acudiente',
      parrafos: [
        'Los documentos que el acudiente cargue (por ejemplo, para la matrícula o para justificar una inasistencia) deben ser auténticos y estar vigentes. Presentar documentos falsos o alterados puede tener consecuencias legales y anular el trámite.',
        'El acudiente solo puede consultar la información de los estudiantes con los que está vinculado en la institución. Debe mantener actualizados sus datos de contacto para recibir citaciones y avisos.',
        'Los certificados que se descarguen por la plataforma son documentos de la institución; no deben alterarse.',
      ],
    },
    {
      titulo: '6. Sus datos',
      parrafos: [
        'Puede pedir a la secretaría que actualice o corrija sus datos o los del estudiante. La información de convivencia, orientación e inclusión se trata con reserva y la familia la conoce por los canales que establece la institución.',
      ],
    },
    {
      titulo: '7. Incumplimiento',
      parrafos: [
        'El uso indebido de la plataforma puede dar lugar a la suspensión del acceso y a las medidas que prevé el Manual de Convivencia.',
      ],
    },
  ],
};

const ADMINISTRATIVO: DocumentoTerminos = {
  tipo: 'ADMINISTRATIVO',
  titulo: 'Términos y condiciones para el personal administrativo y directivo',
  version: '1.0',
  vigente_desde: '2026-10-29',
  introduccion:
    'Además de los términos generales, quien ingresa con un perfil administrativo o directivo de {institucion} (rectoría, coordinación académica, coordinación de convivencia, orientación o secretaría) acepta las siguientes condiciones. Estos perfiles tienen acceso amplio a la información, por eso sus obligaciones son mayores.',
  secciones: [
    {
      titulo: '1. Acceso por necesidad',
      parrafos: [
        'Consulte únicamente la información que necesita para cumplir su función. Que el sistema le permita ver un dato no significa que pueda usarlo para cualquier fin. Las consultas de información reservada quedan registradas.',
      ],
    },
    {
      titulo: '2. Confidencialidad reforzada',
      parrafos: [
        'Los datos de salud, discapacidad, inclusión (PIAR), convivencia y orientación son datos sensibles. No se divulgan, no se comparten con personas no autorizadas y no se usan para decisiones ajenas a la protección y el acompañamiento del estudiante.',
        'Quien ejerce orientación o psicología mantiene, además, el secreto profesional que le impone la Ley 1090 de 2006. Quien tenga un conflicto de interés en un caso de convivencia debe declararse impedido.',
      ],
    },
    {
      titulo: '3. Exactitud de los registros oficiales',
      parrafos: [
        'Matrículas, folios del Libro de Matrícula, certificados, actas, cierres de promoción y reportes oficiales (SIMAT, DANE) deben corresponder a la realidad y a los soportes que se tienen. Lo que ya es oficial no se borra: se corrige o se anula con el motivo, como lo exige la plataforma.',
      ],
    },
    {
      titulo: '4. Gestión de usuarios y permisos',
      parrafos: [
        'Cree cuentas solo para las personas que las necesitan y con el perfil que les corresponde. Desactive las cuentas de quienes dejan la institución. No asigne permisos superiores a los necesarios.',
      ],
    },
    {
      titulo: '5. Firmas, sellos y documentos',
      parrafos: [
        'Las imágenes de firmas y sellos cargadas en la plataforma deben custodiarse. No expida documentos sin el soporte correspondiente ni en nombre de otra persona. Si sospecha que una firma o un sello se usó sin autorización, informe de inmediato a rectoría.',
      ],
    },
    {
      titulo: '6. Exportaciones y reportes',
      parrafos: [
        'Los archivos que exporte (listados, sábanas, reportes, bitácoras) contienen datos personales. Úselos solo para el fin institucional que los motivó, guárdelos en equipos y carpetas de la institución y elimínelos cuando ya no se requieran.',
      ],
    },
    {
      titulo: '7. Incidentes de seguridad',
      parrafos: [
        'Si detecta un acceso no autorizado, la pérdida de un equipo con información o cualquier incidente que comprometa datos personales, repórtelo de inmediato a rectoría para que la institución tome las medidas y cumpla los deberes de reporte que exige la ley.',
      ],
    },
    {
      titulo: '8. Incumplimiento',
      parrafos: [
        'El uso indebido de la plataforma o de la información puede dar lugar a la suspensión del acceso y a las acciones laborales, contractuales o disciplinarias que correspondan, sin perjuicio de las responsabilidades legales.',
      ],
    },
  ],
};

export const DOCUMENTOS_TERMINOS: Record<TipoTerminos, DocumentoTerminos> = { GENERAL, DOCENTE, ESTUDIANTE, ADMINISTRATIVO };

/** Toda persona acepta los generales y los de su perfil activo; un perfil nuevo pide los suyos al entrar con él. */
export const tiposExigidos = (rol: Rol): TipoTerminos[] => ['GENERAL', TERMINOS_POR_ROL[rol]];
