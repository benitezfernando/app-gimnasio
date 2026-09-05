import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { LoginUseCase } from '../../application/login.use-case';
import { LoginDto } from './dto/login.dto';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @Public()
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    // No devolver la sesión completa tal cual: `AuthSession` incluye
    // `authUserId` (id interno de Supabase, agregado para el chequeo de
    // `activo` en LoginUseCase) — nunca debe salir por la API pública.
    const { accessToken, refreshToken } = await this.loginUseCase.execute(dto);
    return { accessToken, refreshToken };
  }
}
