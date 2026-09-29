import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MongooseModuleOptions,
  MongooseOptionsFactory,
} from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import {
  AppConfig,
  APP_CONFIG_KEY,
  DatabaseConfig,
  DATABASE_CONFIG_KEY,
} from '../config';

@Injectable()
export class MongooseConfigService implements MongooseOptionsFactory {
  private readonly logger = new Logger('Mongoose');

  constructor(private readonly configService: ConfigService) {}

  createMongooseOptions(): MongooseModuleOptions {
    const db =
      this.configService.getOrThrow<DatabaseConfig>(DATABASE_CONFIG_KEY);
    const app = this.configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

    return {
      uri: db.uri,
      dbName: db.dbName,

      maxPoolSize: db.maxPoolSize,
      minPoolSize: db.minPoolSize,

      // Fail fast instead of hanging a request forever.
      serverSelectionTimeoutMS: db.serverSelectionTimeoutMS,
      socketTimeoutMS: 45_000,
      connectTimeoutMS: 10_000,
      heartbeatFrequencyMS: 10_000,

      // Indexes in production should come from a deliberate migration.
      autoIndex: !app.isProduction,
      autoCreate: !app.isProduction,
      // Majority writes plus retries survive a replica failover.
      writeConcern: { w: 'majority', journal: true },
      retryWrites: true,
      retryReads: true,
      // Surface a clear error while disconnected rather than queueing requests.
      bufferCommands: false,

      retryAttempts: app.isProduction ? 10 : 3,
      retryDelay: 3000,

      connectionFactory: (connection: Connection, name: string): Connection => {
        this.registerEventListeners(connection, name);

        if (db.debug) {
          this.logger.warn(
            'Query debugging is ENABLED — do not use this in production',
          );
          connection.base.set('debug', true);
        }

        connection.base.set('strictQuery', 'throw');
        connection.base.set('sanitizeFilter', true);

        return connection;
      },
    };
  }

  private registerEventListeners(connection: Connection, name: string): void {
    const label = name === 'DatabaseConnection' ? 'default' : name;

    connection.on('connected', () =>
      this.logger.log(
        `Connected to MongoDB (connection: ${label}, db: ${connection.name})`,
      ),
    );
    connection.on('disconnected', () =>
      this.logger.warn(`Disconnected from MongoDB (${label})`),
    );
    connection.on('reconnected', () =>
      this.logger.log(`Reconnected to MongoDB (${label})`),
    );
    // Log the message only — the URI carries credentials.
    connection.on('error', (error: Error) =>
      this.logger.error(
        `MongoDB connection error (${label}): ${error.message}`,
      ),
    );
  }
}
