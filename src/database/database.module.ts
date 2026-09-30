import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IndexSyncService } from './index-sync.service';
import { MongooseConfigService } from './mongoose-config.service';
import { SearchTokensBackfillService } from './search-tokens-backfill.service';

@Global()
@Module({
  imports: [MongooseModule.forRootAsync({ useClass: MongooseConfigService })],
  providers: [IndexSyncService, SearchTokensBackfillService],
  exports: [MongooseModule, IndexSyncService, SearchTokensBackfillService],
})
export class DatabaseModule {}
