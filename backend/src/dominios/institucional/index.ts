// Única puerta del dominio: los demás dominios importan de aquí, nunca de sus subcarpetas.
// Las rutas (`./rutas`) las monta solo `routes/index.ts`. Los modelos aún se importan directo; se cierran en una fase posterior.
export * from './calendario/academicYear.service';
export * from './calendario/calendarioAcademico';
export * from './calendario/calendarioContexto.service';
export * from './calendario/periodLock.service';
export * from './institucion/institution.service';
export * from './parametros/escalaEvaluacion';
export * from './parametros/siee';
