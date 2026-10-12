import { describe, expect, it } from 'vitest';
import {
  ACTIVIDADES_RECTORAS_PREESCOLAR,
  TIPOS_ESTRUCTURA_CURRICULAR,
  TIPOS_REFERENTE,
} from '../src/constants/enums';
import { createArea } from '../src/validators/area.validator';
import {
  createReferentes,
  listReferentes,
} from '../src/validators/referenteCurricular.validator';
import { upsertDraft } from '../src/validators/curricularDevelopment.validator';

describe('M07 & M06: Validación Curricular Flexible y Preescolar', () => {
  describe('Áreas y Dimensiones del Desarrollo (M06)', () => {
    it('permite crear un área disciplinar estándar', () => {
      const data = {
        nombre: 'Matemáticas',
        descripcion: 'Área fundamental de matemáticas',
        codigo: 'MAT',
        tipo_estructura: 'AREA_DISCIPLINAR',
      };
      const { error, value } = createArea.body!.validate(data);
      expect(error).toBeUndefined();
      expect(value.tipo_estructura).toBe('AREA_DISCIPLINAR');
    });

    it('permite crear una dimensión del desarrollo para preescolar (Decreto 2247)', () => {
      const data = {
        nombre: 'Dimensión Cognitiva',
        descripcion: 'Desarrollo del pensamiento, exploración y relaciones lógicas',
        codigo: 'DIM-COG',
        tipo_estructura: 'DIMENSION_DESARROLLO',
      };
      const { error, value } = createArea.body!.validate(data);
      expect(error).toBeUndefined();
      expect(value.tipo_estructura).toBe('DIMENSION_DESARROLLO');
    });

    it('por defecto asigna AREA_DISCIPLINAR si no se especifica tipo_estructura', () => {
      const data = {
        nombre: 'Ciencias Sociales',
        descripcion: 'Historia y geografía',
        codigo: 'SOC',
      };
      const { error, value } = createArea.body!.validate(data);
      expect(error).toBeUndefined();
      expect(value.tipo_estructura).toBe('AREA_DISCIPLINAR');
    });

    it('rechaza un tipo_estructura no válido', () => {
      const data = {
        nombre: 'Materia Ficticia',
        descripcion: 'Invalido',
        codigo: 'INV',
        tipo_estructura: 'OTRA_ESTRUCTURA',
      };
      const { error } = createArea.body!.validate(data);
      expect(error).toBeDefined();
    });
  });

  describe('Banco Polimórfico de Referentes Curriculares (M07)', () => {
    const fakeObjectId = '507f1f77bcf86cd799439011';
    const fakeGradeId = '507f191e810c19729de860ea';

    it('valida referente oficial tipo DBA', () => {
      const payload = [
        {
          tipo_referente: 'DBA',
          area_id: fakeObjectId,
          grade_id: fakeGradeId,
          numero_dba: 1,
          organizador: 'Pensamiento Numérico',
          enunciado: 'Interpreta y utiliza los números naturales...',
          evidencias_aprendizaje: ['Compara números', 'Resuelve problemas'],
        },
      ];
      const { error } = createReferentes.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('valida referente oficial tipo EBC', () => {
      const payload = [
        {
          tipo_referente: 'EBC',
          area_id: fakeObjectId,
          grupo_grados: '6-7',
          organizador: 'Pensamiento Variacional',
          competencia: 'Razonamiento',
          enunciado: 'Describo y represento situaciones de variación...',
          evidencias_aprendizaje: ['Elabora gráficas cartesianas'],
        },
      ];
      const { error } = createReferentes.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('valida referente Pruebas Saber / Matriz ICFES', () => {
      const payload = [
        {
          tipo_referente: 'MATRIZ_ICFES',
          area_id: fakeObjectId,
          grade_id: fakeGradeId,
          componente: 'Numérico-Variacional',
          competencia: 'Comunicación y representación',
          aprendizaje: 'Transforma datos cuantitativos',
          enunciado: 'Comprende y transforma información cuantitativa...',
          evidencias_aprendizaje: ['Extrae información de tablas estadísticas'],
        },
      ];
      const { error } = createReferentes.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('valida referente institucional del PEI (Autonomía Art. 77 Ley 115)', () => {
      const payload = [
        {
          tipo_referente: 'REFERENTE_INSTITUCIONAL',
          area_id: fakeObjectId,
          organizador: 'Robótica y Automatización Básica',
          enunciado: 'Diseña prototipos automatizados aplicando principios de mecatrónica.',
          evidencias_aprendizaje: ['Construye un circuito sensor'],
        },
      ];
      const { error } = createReferentes.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('valida referente de preescolar: Dimensión y Experiencia (Decreto 2247)', () => {
      const payload = [
        {
          tipo_referente: 'DIMENSION_EXPERIENCIA',
          area_id: fakeObjectId,
          grade_id: fakeGradeId,
          actividad_rectora: 'JUEGO',
          enunciado: 'Expresa libremente sus ideas y emociones a través de relatos y juegos dramáticos.',
          evidencias_aprendizaje: ['Narra experiencias cotidianas con vocabulario enriquecido'],
        },
      ];
      const { error } = createReferentes.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('filtra referentes por cualquier tipo_referente permitido', () => {
      for (const tipo of TIPOS_REFERENTE) {
        const { error } = listReferentes.query!.validate({ tipo_referente: tipo });
        expect(error).toBeUndefined();
      }
    });
  });

  describe('Formulación Pedagógica: Secuencia Didáctica y Preescolar', () => {
    const fakeAssignmentId = '507f1f77bcf86cd799439012';

    it('acepta planeación de Básica/Media con Secuencia Didáctica (Inicio, Desarrollo, Cierre)', () => {
      const payload = {
        teacher_assignment_id: fakeAssignmentId,
        periodo_numero: 1,
        dba_seleccionados: ['507f1f77bcf86cd799439013'],
        evidencias_seleccionadas: ['Compara números'],
        competencias: 'Competencias de razonamiento lógico y algorítmico',
        contenidos_tematicos: ['Conjuntos numéricos', 'Operaciones básicas'],
        fase_inicio: 'Activación de saberes previos con un juego de cartas numéricas.',
        fase_desarrollo: 'Conceptualización de números enteros y taller práctico en parejas.',
        fase_cierre: 'Plenario de dudas y evaluación formativa mediante una pregunta en Kahoot.',
        metodologia_y_recursos: 'Aprendizaje basado en problemas, guías de trabajo y TIC.',
        criterios_evaluacion: 'Participación en clase, rúbrica de taller y autoevaluación.',
        semanas_estimadas: 10,
        es_preescolar: false,
      };
      const { error } = upsertDraft.body!.validate(payload);
      expect(error).toBeUndefined();
    });

    it('acepta planeación de Preescolar con Proyecto Lúdico-Pedagógico (Decreto 2247)', () => {
      const payload = {
        teacher_assignment_id: fakeAssignmentId,
        periodo_numero: 1,
        dba_seleccionados: [],
        competencias: 'Desarrollo integral de la autonomía y expresión corporal',
        contenidos_tematicos: ['Los animales de mi entorno', 'Cuidado de la naturaleza'],
        es_preescolar: true,
        nombre_proyecto: 'Pequeños Exploradores: El Reino Animal',
        dimensiones_articuladas: ['Cognitiva', 'Comunicativa', 'Corporal', 'Socioafectiva'],
        actividades_rectoras: ['JUEGO', 'ARTE', 'EXPLORACION_MEDIO'],
        experiencias_significativas: 'Rincón de la selva, dramatización de animales con máscaras y salida a la huerta escolar.',
        metodologia_y_recursos: 'Rincones de aprendizaje, talleres lúdicos y materiales naturales.',
        criterios_evaluacion: 'Observación continua, diario de campo y registro descriptivo de avances.',
        semanas_estimadas: 10,
      };
      const { error } = upsertDraft.body!.validate(payload);
      expect(error).toBeUndefined();
    });
  });
});
