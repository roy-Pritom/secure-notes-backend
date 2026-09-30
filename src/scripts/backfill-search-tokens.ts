import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { SearchTokensBackfillService } from '../database/search-tokens-backfill.service';

const logger = new Logger('db:search-tokens');

/** Deploy step: tokenize documents that predate `searchTokens`, then exit. */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  context.useLogger(logger);

  try {
    const filled = await context.get(SearchTokensBackfillService).backfill();
    logger.log(`Backfill complete — ${filled} document(s) tokenized`);
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
