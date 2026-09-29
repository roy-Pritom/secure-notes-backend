import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { SECURITY_CONFIG_KEY } from '../../config';
import { API_KEY_HEADER, ApiKeyGuard } from './api-key.guard';

const VALID_KEY = 'a'.repeat(32);
const SECOND_KEY = 'b'.repeat(32);

const contextWith = (headers: Record<string, string> = {}): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

const buildGuard = (apiKeys: string[], skip = false): ApiKeyGuard => {
  const configService = {
    getOrThrow: (key: string) =>
      key === SECURITY_CONFIG_KEY ? { apiKeys } : undefined,
  } as unknown as ConfigService;

  const reflector = {
    getAllAndOverride: () => skip,
  } as unknown as Reflector;

  return new ApiKeyGuard(reflector, configService);
};

describe('ApiKeyGuard', () => {
  it('accepts any of the configured keys', () => {
    const guard = buildGuard([VALID_KEY, SECOND_KEY]);

    expect(
      guard.canActivate(contextWith({ [API_KEY_HEADER]: VALID_KEY })),
    ).toBe(true);
    expect(
      guard.canActivate(contextWith({ [API_KEY_HEADER]: SECOND_KEY })),
    ).toBe(true);
  });

  it('rejects a request with no key', () => {
    expect(() => buildGuard([VALID_KEY]).canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a whitespace-only key rather than trimming it to nothing', () => {
    expect(() =>
      buildGuard([VALID_KEY]).canActivate(
        contextWith({ [API_KEY_HEADER]: '   ' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an unknown key', () => {
    expect(() =>
      buildGuard([VALID_KEY]).canActivate(
        contextWith({ [API_KEY_HEADER]: 'c'.repeat(32) }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a key that is only a prefix of a valid one', () => {
    expect(() =>
      buildGuard([VALID_KEY]).canActivate(
        contextWith({ [API_KEY_HEADER]: VALID_KEY.slice(0, 16) }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('lets a @SkipApiKey() route through without a key', () => {
    expect(buildGuard([VALID_KEY], true).canActivate(contextWith())).toBe(true);
  });

  it('is inert when no key is configured', () => {
    expect(buildGuard([]).canActivate(contextWith())).toBe(true);
  });
});
