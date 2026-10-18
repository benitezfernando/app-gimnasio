import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, UserRecord, UserRepositoryPort } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

export interface GetCurrentUserInput {
  userId: string;
}

/**
 * A diferencia de `req.user` (poblado desde el JWT, sin ir a la DB), esto
 * trae el `UserRecord` completo — lo necesita `GET /users/me` para
 * devolver `nombre`/`username`, que no viajan en el JWT. Solo este
 * endpoint paga el round-trip extra; el guard de cada request sigue sin
 * tocar la DB.
 */
@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: GetCurrentUserInput): Promise<UserRecord> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }
    return user;
  }
}
