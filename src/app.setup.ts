import { VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';

import { AppConfig } from './config';

/** Shared by `main.ts` and the e2e tests so both run the same configuration. */
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
): void {
  const { apiPrefix, corsOrigins, isProduction } = config;

  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(compression());
  app.disable('x-powered-by');
  // Trust exactly one proxy hop; trusting all would let a client forge
  // `X-Forwarded-For` and bypass the throttler.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  });

  // The default body limit is generous enough to be a memory risk.
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  app.setGlobalPrefix(apiPrefix, {
    // Probes stay on a stable path orchestrators can rely on.
    exclude: ['health', 'health/liveness', 'health/readiness', 'health/ping'],
  });
  // No `defaultVersion`: every controller states its own version, so a
  // missing one is an obvious error rather than a silent fallback to v1.
  app.enableVersioning({ type: VersioningType.URI });

  app.enableShutdownHooks();
}
