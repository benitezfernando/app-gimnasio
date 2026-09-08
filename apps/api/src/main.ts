import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared-kernel/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({
    // Whitelist explícita — nunca `origin: '*'`. `CORS_ORIGIN` acepta uno o
    // más orígenes separados por coma (ej. producción + un preview de
    // Vercel). Sin la env var, solo local dev (`next dev` en :3000). El
    // proxy BFF (`apps/web/app/api/proxy`) y `apiFetch` corren
    // server-to-server y no pasan por CORS — esto cubre cualquier llamada
    // directa browser→API, actual o futura (ver docs/hld-mvp.md §5).
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
