export class DuplicateUsernameError extends Error {
  constructor(username: string, gymId: string) {
    super(`Ya existe un usuario con username '${username}' en el gym '${gymId}'.`);
    this.name = 'DuplicateUsernameError';
  }
}
