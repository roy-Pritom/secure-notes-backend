import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { MongoConnectionIndicator } from './indicators/mongo-connection.indicator';

@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: 'pretty' })],
  controllers: [HealthController],
  providers: [MongoConnectionIndicator],
})
export class HealthModule {}
