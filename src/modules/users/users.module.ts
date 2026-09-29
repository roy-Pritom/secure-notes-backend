import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PaginationModule } from '../../common/pagination';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { ProfileController } from './profile.controller';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PaginationModule,
    // Password, role, status and deletion changes all end a user's sessions.
    RefreshTokensModule,
  ],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, UsersRepository, AdminBootstrapService],
  // Only the service is exported: other modules must not reach the collection.
  exports: [UsersService],
})
export class UsersModule {}
