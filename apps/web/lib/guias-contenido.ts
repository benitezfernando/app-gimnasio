import type { Guia } from './guias';

// Textos de las guías de bienvenida (spec 2026-10-20-onboarding-guias).
// `elemento` = valor del atributo `data-guia` que resalta cada globo.

export const GUIA_ALUMNO_RUTINA: Guia = {
  id: 'alumno-rutina',
  pasos: [
    {
      titulo: '¡Bienvenido/a!',
      texto: 'Esta es tu rutina. Acá vas a ver los ejercicios que te armó tu profesor.',
    },
    {
      elemento: 'dias-rutina',
      titulo: 'Tus días',
      texto:
        'Tu rutina está dividida en días. Elegí el que te toca hoy; la app lo recuerda para la próxima vez.',
    },
    {
      elemento: 'ejercicio-rutina',
      titulo: 'Cada ejercicio',
      texto:
        'Ves las series, repeticiones y el peso. Tocalo para ver cómo se hace, con la animación y los pasos.',
    },
  ],
};

export const GUIA_CATALOGO: Guia = {
  id: 'catalogo',
  pasos: [
    {
      elemento: 'catalogo-buscador',
      titulo: 'Buscá',
      texto: 'Escribí el nombre de un ejercicio.',
    },
    {
      elemento: 'catalogo-filtros',
      titulo: 'Filtrá',
      texto: 'Filtrá por zona del cuerpo o por el equipamiento que tengas.',
    },
    {
      elemento: 'catalogo-tarjeta',
      titulo: 'Mirá el detalle',
      texto: 'Tocá un ejercicio para ver cómo se hace.',
    },
  ],
};

export const GUIA_PROFESOR_CARTERA: Guia = {
  id: 'profesor-cartera',
  pasos: [
    {
      titulo: '¡Bienvenido/a, profe!',
      texto: 'Esta es tu cartera: los alumnos a tu cargo.',
    },
    {
      elemento: 'nuevo-alumno',
      titulo: 'Sumá alumnos',
      texto:
        'Creá un alumno con nombre y apellido. Entra a la app solo con su usuario, sin contraseña.',
    },
    {
      elemento: 'alumno-fila',
      titulo: 'Su rutina',
      texto: 'Tocá un alumno para asignarle o ajustarle la rutina.',
    },
    {
      elemento: 'nav-plantillas',
      titulo: 'Plantillas',
      texto: 'Armá rutinas modelo y reutilizalas con varios alumnos.',
    },
    {
      elemento: 'nav-catalogo',
      titulo: 'Catálogo',
      texto: 'Todos los ejercicios disponibles.',
    },
  ],
};

export const GUIA_PROFESOR_PLANTILLAS: Guia = {
  id: 'profesor-plantillas',
  pasos: [
    {
      elemento: 'nueva-plantilla',
      titulo: 'Nueva plantilla',
      texto:
        "Ponele un nombre, por ejemplo 'Fuerza 3 días'. Después le cargás los días y los ejercicios.",
    },
    {
      elemento: 'plantilla-fila',
      titulo: 'Editala',
      texto:
        'Tocá una plantilla para armar sus días. Si la cambiás, se actualiza en los alumnos que la tengan vinculada.',
    },
  ],
};

export const GUIA_EDITOR_RUTINA: Guia = {
  id: 'editor-rutina',
  pasos: [
    {
      elemento: 'editor-dias',
      titulo: 'Días',
      texto: 'Cada pestaña es un día. Con + agregás otro.',
    },
    {
      elemento: 'editor-buscador',
      titulo: 'Agregá ejercicios',
      texto: 'Buscá un ejercicio y sumalo al día.',
    },
    {
      elemento: 'editor-imagen',
      titulo: 'Ver detalle',
      texto: 'Tocá la imagen para ver cómo se hace, sin salir del editor.',
    },
    {
      elemento: 'editor-renombrar',
      titulo: 'Renombrar',
      texto:
        'Ponele el nombre con el que lo conocen en tu gimnasio. Lo ven tus alumnos y no cambia el catálogo.',
    },
    {
      elemento: 'editor-valores',
      titulo: 'Series, reps y peso',
      texto: 'Ajustá los valores de cada ejercicio.',
    },
    {
      elemento: 'editor-arrastrar',
      titulo: 'Ordenar',
      texto: 'Arrastrá desde acá para cambiar el orden.',
    },
    {
      elemento: 'editor-guardar',
      titulo: 'Guardá',
      texto: 'Los cambios se aplican recién cuando tocás Guardar.',
    },
  ],
};

export const GUIA_PROFESOR_ALUMNO: Guia = {
  id: 'profesor-alumno',
  pasos: [
    {
      elemento: 'asignar-rutina',
      titulo: 'Asignar rutina',
      texto: 'Asigná una rutina nueva desde una plantilla o desde cero. Reemplaza la que tenga.',
    },
  ],
};
