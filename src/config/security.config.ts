import { registerAs } from '@nestjs/config';

export const SECURITY_CONFIG_KEY = 'security';

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  bcryptSaltRounds: number;
  maxFailedLoginAttempts: number;
  accountLockMs: number;
  throttleTtlMs: number;
  throttleLimit: number;
  /** Optional first administrator, created once on boot. */
  bootstrapAdmin: { email: string; password: string } | null;
}

export default registerAs<SecurityConfig>(SECURITY_CONFIG_KEY, () => ({
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  maxFailedLoginAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  accountLockMs: Number(process.env.LOGIN_LOCK_MS ?? 900_000),
  throttleTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  throttleLimit: Number(process.env.THROTTLE_LIMIT ?? 100),
  bootstrapAdmin:
    process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD
      ? {
          email: process.env.BOOTSTRAP_ADMIN_EMAIL,
          password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
        }
      : null,
}));
