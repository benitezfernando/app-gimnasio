export class DuplicateEmailError extends Error {
  constructor(email: string, gymId: string) {
    super(`Ya existe un usuario con email '${email}' en el gym '${gymId}'.`);
    this.name = 'DuplicateEmailError';
  }
}
