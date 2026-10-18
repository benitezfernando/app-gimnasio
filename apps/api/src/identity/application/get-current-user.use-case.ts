import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, UserRecord, UserRepositoryPort } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

export interface GetCurrentUserInput {
  userId: string;
}

/**
 * `req.user` (`AuthenticatedUser`) solo expone `id`/`gymId`/`role`. Este use
 * case trae el `UserRecord` completo para que `GET /users/me` devuelva
 * `nombre`/`username` sin ampliar `AuthenticatedUser`.
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
