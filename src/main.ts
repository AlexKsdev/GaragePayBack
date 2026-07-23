import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { frontendOrigins } from './config/frontend.config';

async function bootstrap() {
  // rawBody: keep the unparsed body available (req.rawBody) for Stripe webhook
  // signature verification, while JSON parsing still works for every other route.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());

  // Allow the frontend origin(s) to call the API from the browser.
  app.enableCors({
    origin: frontendOrigins(),
    credentials: true,
  });

  // Enable global validation pipe for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
