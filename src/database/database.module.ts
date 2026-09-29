import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongooseConfigService } from './mongoose-config.service';

/** Owns the single Mongoose connection; feature modules only use `forFeature`. */
@Global()
@Module({
  imports: [MongooseModule.forRootAsync({ useClass: MongooseConfigService })],
  exports: [MongooseModule],
})
export class DatabaseModule {}
