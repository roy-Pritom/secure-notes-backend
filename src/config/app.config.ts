import { registerAs } from '@nestjs/config';

import { NodeEnv } from './env.validation';

export const APP_CONFIG_KEY = 'app';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  apiPrefix: string;
  corsOrigins: string[] | true;
  isProduction: boolean;
}

export default registerAs<AppConfig>(APP_CONFIG_KEY, () => {
  const nodeEnv = (process.env.NODE_ENV as NodeEnv) ?? NodeEnv.Development;
  const rawOrigins = process.env.CORS_ORIGINS ?? '*';

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 8000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    // `true` reflects the request origin back; only used outside production.
    corsOrigins:
      rawOrigins === '*'
        ? true
        : rawOrigins
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    isProduction: nodeEnv === NodeEnv.Production,
  };
});
