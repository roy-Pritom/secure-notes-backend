import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { IndexSyncService } from '../database/index-sync.service';

/**
 * Deploy step: build the indexes the schemas declare, then exit.
 *
 * Run this against the new code before it starts taking traffic — the app
 * itself does not build indexes in production, so a listing whose index has
 * not been created yet would scan the collection instead.
 *
 * Pass `--prune` to also drop indexes no schema declares any more, which
 * leaves the database matching the code exactly.
 *
 * This boots the full application context without a listener, so the
 * `AdminBootstrapService` hook runs too. That is harmless: creating the first
 * administrator is idempotent and skips itself once the address exists.
 */
async function main(): Promise<void> {
  const logger = new Logger('db:indexes');
  const prune = process.argv.includes('--prune');

  const context = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  context.useLogger(logger);

  try {
    await context.get(IndexSyncService).sync(prune);
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  new Logger('db:indexes').error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
