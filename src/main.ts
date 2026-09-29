import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG_KEY, AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const appConfig = app
    .get(ConfigService)
    .getOrThrow<AppConfig>(APP_CONFIG_KEY);
  configureApp(app, appConfig);

  if (!appConfig.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Secure Notes API')
        .setDescription('REST API backed by MongoDB')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${appConfig.apiPrefix}/docs`, app, document);
  }

  await app.listen(appConfig.port);

  new Logger('Bootstrap').log(
    `Listening on ${await app.getUrl()} (prefix: /${appConfig.apiPrefix}, env: ${appConfig.nodeEnv})`,
  );
}

void bootstrap();
