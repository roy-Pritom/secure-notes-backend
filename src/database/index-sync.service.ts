import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Collection, Connection, Schema } from 'mongoose';

import { DATABASE_CONFIG_KEY, DatabaseConfig } from '../config';

export interface ModelIndexReport {
  model: string;
  collection: string;
  /** Index names that did not exist before this run. */
  created: string[];
  /** Index names removed because no `schema.index()` declares them any more. */
  dropped: string[];
}


@Injectable()
export class IndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger('IndexSync');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { syncIndexesOnBoot } =
      this.configService.getOrThrow<DatabaseConfig>(DATABASE_CONFIG_KEY);

    if (!syncIndexesOnBoot) {
      this.logger.log(
        'Skipping index build (MONGODB_SYNC_INDEXES is off); run `pnpm db:indexes` as a deploy step',
      );
      return;
    }

    await this.sync();
  }


  async sync(prune = false): Promise<ModelIndexReport[]> {
    const reports: ModelIndexReport[] = [];

    for (const modelName of this.connection.modelNames()) {
      const model = this.connection.model(modelName);

     
      const present = await existingIndexNames(model.collection);
      const created = declaredIndexNames(model.schema).filter(
        (name) => !present.includes(name),
      );

      let dropped: string[] = [];
      if (prune) {
        dropped = await model.syncIndexes();
      } else {
        await model.createIndexes();
      }

      reports.push({
        model: modelName,
        collection: model.collection.collectionName,
        created,
        dropped,
      });
    }

    this.report(reports);
    return reports;
  }

  private report(reports: ModelIndexReport[]): void {
    const created = reports.flatMap((report) => report.created);
    const dropped = reports.flatMap((report) => report.dropped);

    for (const report of reports) {
      for (const name of report.created) {
        this.logger.log(`Created ${report.collection}.${name}`);
      }
      // Loud, not incidental: an index that disappears is a query plan that
      // silently gets worse.
      for (const name of report.dropped) {
        this.logger.warn(`Dropped ${report.collection}.${name}`);
      }
    }

    this.logger.log(
      `Indexes in sync across ${reports.length} collection(s) — ` +
        `${created.length} created, ${dropped.length} dropped`,
    );
  }
}


function declaredIndexNames(schema: Schema): string[] {
  return schema
    .indexes()
    .map(([, options]) => (options as { name?: string }).name)
    .filter((name): name is string => Boolean(name));
}

async function existingIndexNames(collection: Collection): Promise<string[]> {
  try {
    const indexes = await collection.indexes();
    return indexes.map((index) => index.name ?? '').filter(Boolean);
  } catch {
    // The collection does not exist yet, so it has no indexes to compare to.
    return [];
  }
}
