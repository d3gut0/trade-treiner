import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // app.useGlobalPipes(
  //   new ValidationPipe({
  //     whitelist: true,
  //     transform: true,
  //   }),
  // );

  app.useGlobalPipes(
  new ValidationPipe({
    exceptionFactory: (errors) => {
      console.log('[DEBUG] Erros de validação:', JSON.stringify(errors, null, 2));
      return new BadRequestException(errors);
    },
  }),
);

  const port = process.env.PORT ?? 3500;
  await app.listen(port);
  console.log(`[trade-trainer-backend] rodando em http://localhost:${port}`);
}

bootstrap();
