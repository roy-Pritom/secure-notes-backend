import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { IndexSyncService } from '../database/index-sync.service';

const logger = new Logger('db:indexes');

/**
 * Deploy step: build the indexes the schemas declare, then exit. Run it before
 * the new code takes traffic — production does not build indexes on boot.
 * `--prune` also drops indexes no schema declares any more.
 */
async function main(): Promise<void> {
  // A full context without a listener, so `AdminBootstrapService` also runs.
  // That is harmless: it skips itself once the administrator exists.
  const context = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  context.useLogger(logger);

  try {
    await context.get(IndexSyncService).sync(process.argv.includes('--prune'));
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
