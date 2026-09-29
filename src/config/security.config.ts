import { registerAs } from '@nestjs/config';

export const SECURITY_CONFIG_KEY = 'security';

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  throttleTtlMs: number;
  throttleLimit: number;
}

export default registerAs<SecurityConfig>(SECURITY_CONFIG_KEY, () => ({
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  throttleTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  throttleLimit: Number(process.env.THROTTLE_LIMIT ?? 100),
}));
