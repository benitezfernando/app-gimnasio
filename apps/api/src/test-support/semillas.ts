import { PrismaClient, Role } from '@prisma/client';

export const GYM = 'gym-1';

/** prof-1, prof-2 (mismo gym), alum-1, alum-2 y ejercicios ex-1..ex-5. */
export async function sembrarUsuariosYEjercicios(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: 'prof-1',
        authUserId: 'auth-prof-1',
        gymId: GYM,
        username: 'prof1',
        nombre: 'Profe 1',
        role: Role.PROFESOR,
      },
      {
        id: 'prof-2',
        authUserId: 'auth-prof-2',
        gymId: GYM,
        username: 'prof2',
        nombre: 'Profe 2',
        role: Role.PROFESOR,
      },
      {
        id: 'alum-1',
        authUserId: 'auth-alum-1',
        gymId: GYM,
        username: 'alum1',
        nombre: 'Alumno 1',
        role: Role.ALUMNO,
      },
      {
        id: 'alum-2',
        authUserId: 'auth-alum-2',
        gymId: GYM,
        username: 'alum2',
        nombre: 'Alumno 2',
        role: Role.ALUMNO,
      },
    ],
  });
  await prisma.exercise.createMany({
    data: ['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5'].map((id) => ({
      id,
      nombre: id,
      parteCuerpo: 'piernas',
      grupoMuscular: 'cuadriceps',
    })),
  });
}
