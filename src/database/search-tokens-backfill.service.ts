import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { backfillSearchTokens } from '../common/search';
import { DATABASE_CONFIG_KEY, DatabaseConfig } from '../config';

/**
 * Gives documents written before `searchTokens` existed their tokens, so they
 * are not silently missing from search. Rides on the same switch as the index
 * build: on boot in development, `npm run db:search-tokens` as a deploy step.
 */
@Injectable()
export class SearchTokensBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SearchTokens');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { syncIndexesOnBoot } =
      this.configService.getOrThrow<DatabaseConfig>(DATABASE_CONFIG_KEY);
    if (syncIndexesOnBoot) {
      await this.backfill();
    }
  }

  async backfill(): Promise<number> {
    let total = 0;
    for (const modelName of this.connection.modelNames()) {
      const model = this.connection.model(modelName);
      const filled = await backfillSearchTokens(model);
      if (filled > 0) {
        this.logger.log(
          `Tokenized ${filled} ${model.collection.collectionName} document(s)`,
        );
      }
      total += filled;
    }
    return total;
  }
}
