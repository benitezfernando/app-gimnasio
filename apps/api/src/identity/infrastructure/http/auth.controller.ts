import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { LoginUseCase } from '../../application/login.use-case';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
  ) {}

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

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    // Sin rate limit dedicado: a diferencia de username/password (baja
    // entropía, el username del alumno es su único secreto), un
    // refresh_token es un secreto de alta entropía emitido por Supabase —
    // no es adivinable por fuerza bruta, así que el riesgo que el rate
    // limit de /auth/login mitiga no aplica acá de la misma forma.
    const { accessToken, refreshToken } = await this.refreshSessionUseCase.execute(dto);
    return { accessToken, refreshToken };
  }
}
