export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`No existe un usuario con id '${userId}' en tu gym.`);
    this.name = 'UserNotFoundError';
  }
}
