import { SetMetadata } from '@nestjs/common';

export const SKIP_API_KEY_KEY = 'skipApiKey';

/**
 * Opts a route out of the globally applied `ApiKeyGuard`. Reserved for callers
 * that cannot carry a key — orchestrator and load-balancer probes.
 */
export const SkipApiKey = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_API_KEY_KEY, true);
