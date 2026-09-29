import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../modules/auth/decorators';
import { MongoConnectionIndicator } from './indicators/mongo-connection.indicator';

const HEAP_LIMIT_BYTES = 300 * 1024 * 1024;
const RSS_LIMIT_BYTES = 512 * 1024 * 1024;
const DB_PING_TIMEOUT_MS = 1500;

@ApiTags('health')
// Probes must answer before anyone has a token.
@Public()
// Version-neutral: versioning would otherwise move the probes to `/v1/health`
// and silently break orchestrator health checks.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly mongoConnection: MongoConnectionIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  /** Full picture for dashboards and humans; probes use the endpoints below. */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health report' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb', { timeout: DB_PING_TIMEOUT_MS }),
      () => this.mongoConnection.isHealthy(),
      () => this.memory.checkHeap('memory_heap', HEAP_LIMIT_BYTES),
      () => this.memory.checkRSS('memory_rss', RSS_LIMIT_BYTES),
    ]);
  }

  /** Checks no dependency: a database outage must not restart healthy pods. */
  @Get('liveness')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe — process only, no dependencies' })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', HEAP_LIMIT_BYTES),
    ]);
  }

  /** Fails while the database is unreachable, pulling the pod out of the LB. */
  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — dependencies must be reachable' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.mongoConnection.isHealthy(),
      () => this.mongoose.pingCheck('mongodb', { timeout: DB_PING_TIMEOUT_MS }),
    ]);
  }

  /** Cheapest possible endpoint, for load-balancer checks. */
  @Get('ping')
  @ApiExcludeEndpoint()
  ping(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
