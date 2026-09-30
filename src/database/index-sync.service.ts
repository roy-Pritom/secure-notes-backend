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
  /**
   * Index names the schema still declares but under a different key list, so
   * the stale definition was dropped and rebuilt.
   */
  rekeyed: string[];
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
        'Skipping index build (MONGODB_SYNC_INDEXES is off); run `npm run db:indexes` as a deploy step',
      );
      return;
    }

    await this.sync();
  }

  /** @param prune also drop indexes the schemas no longer declare. */
  async sync(prune = false): Promise<ModelIndexReport[]> {
    const reports: ModelIndexReport[] = [];

    for (const modelName of this.connection.modelNames()) {
      const model = this.connection.model(modelName);

      const existing = await existingIndexes(model.collection);
      const present = existing.map((index) => index.name);
      const created = declaredIndexNames(model.schema).filter(
        (name) => !present.includes(name),
      );

      // Must run before either branch below: `createIndexes()` refuses to
      // redefine a name whose key list changed (MongoDB error 86) rather than
      // replacing it, which would otherwise wedge every boot after a schema
      // edit that re-keys an index without renaming it.
      const rekeyed = await dropRekeyedIndexes(model, existing);

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
        rekeyed,
      });
    }

    this.report(reports);
    return reports;
  }

  private report(reports: ModelIndexReport[]): void {
    let created = 0;
    let dropped = 0;
    let rekeyed = 0;

    for (const report of reports) {
      for (const name of report.created) {
        created += 1;
        this.logger.log(`Created ${report.collection}.${name}`);
      }
      for (const name of report.rekeyed) {
        rekeyed += 1;
        // Worth a warning: the index is absent for as long as the rebuild
        // takes, and on a large collection that is not instant.
        this.logger.warn(
          `Rebuilt ${report.collection}.${name} — its key list changed`,
        );
      }
      for (const name of report.dropped) {
        dropped += 1;
        // A warning, not a log line: an index that disappears is a query plan
        // that silently gets worse.
        this.logger.warn(`Dropped ${report.collection}.${name}`);
      }
    }

    this.logger.log(
      `Indexes in sync across ${reports.length} collection(s) — ` +
        `${created} created, ${rekeyed} rebuilt, ${dropped} dropped`,
    );
  }
}

function declaredIndexNames(schema: Schema): string[] {
  return schema
    .indexes()
    .map(([, options]) => (options as { name?: string }).name)
    .filter((name): name is string => Boolean(name));
}

interface ExistingIndex {
  name: string;
  key: Record<string, unknown>;
}

async function existingIndexes(
  collection: Collection,
): Promise<ExistingIndex[]> {
  try {
    const indexes = await collection.indexes();
    // `flatMap` rather than filter-then-map: the driver types `name` as
    // optional, and only a guard in the same expression narrows it.
    return indexes.flatMap((index) =>
      index.name
        ? [
            {
              name: index.name,
              key: index.key ?? {},
            },
          ]
        : [],
    );
  } catch {
    // The collection does not exist yet, so it has no indexes to compare to.
    return [];
  }
}

/**
 * Drops any index whose name the schema still declares but whose key list no
 * longer matches. The name match makes this unambiguous: it is a stale copy of
 * one of our own indexes, never someone else's, and the caller rebuilds it on
 * the next line.
 */
async function dropRekeyedIndexes(
  // Structural rather than `Model<T>`: `connection.model()` hands back
  // `Model<any>`, which will not narrow to any concrete document type.
  model: { schema: Schema; collection: Collection },
  existing: ExistingIndex[],
): Promise<string[]> {
  const rekeyed: string[] = [];

  for (const [keys, options] of model.schema.indexes()) {
    const name = (options as { name?: string }).name;
    if (!name) {
      continue;
    }

    const current = existing.find((index) => index.name === name);
    if (!current || sameKeySpec(current.key, keys)) {
      continue;
    }

    await model.collection.dropIndex(name);
    rekeyed.push(name);
  }

  return rekeyed;
}

/** Key order is part of an index's identity, so compare entries positionally. */
function sameKeySpec(
  current: Record<string, unknown>,
  declared: Record<string, unknown>,
): boolean {
  const left = Object.entries(current);
  const right = Object.entries(declared);

  return (
    left.length === right.length &&
    left.every(
      ([field, direction], position) =>
        right[position][0] === field &&
        // `1`/`-1` arrive as numbers from the driver and may be either in the
        // schema; `'text'` and `'2dsphere'` compare as themselves.
        String(right[position][1]) === String(direction),
    )
  );
}
