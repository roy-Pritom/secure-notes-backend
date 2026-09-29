import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Connection, ConnectionStates } from 'mongoose';

const STATE_LABELS: Record<number, string> = {
  [ConnectionStates.disconnected]: 'disconnected',
  [ConnectionStates.connected]: 'connected',
  [ConnectionStates.connecting]: 'connecting',
  [ConnectionStates.disconnecting]: 'disconnecting',
  [ConnectionStates.uninitialized]: 'uninitialized',
};

/**
 * Complements Terminus' `pingCheck`: a ping says the server answered, this
 * says whether our own pool is usable — e.g. while the driver reconnects.
 */
@Injectable()
export class MongoConnectionIndicator {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isHealthy(key = 'mongodb-connection'): HealthIndicatorResult {
    const indicator = this.healthIndicatorService.check(key);
    const state = this.connection.readyState;
    const details = {
      state: STATE_LABELS[state] ?? `unknown(${state})`,
      database: this.connection.name ?? 'unknown',
    };

    return state === ConnectionStates.connected
      ? indicator.up(details)
      : indicator.down(details);
  }
}
