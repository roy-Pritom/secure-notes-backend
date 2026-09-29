import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SECURITY_CONFIG_KEY, SecurityConfig } from '../../config';
import { UserRole } from './enums';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Creates the first administrator from the environment, because an empty
 * database otherwise has no account that could promote anyone. Idempotent:
 * once the address exists, every later boot leaves it alone.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { bootstrapAdmin } =
      this.configService.getOrThrow<SecurityConfig>(SECURITY_CONFIG_KEY);

    if (!bootstrapAdmin) {
      return;
    }

    if (await this.usersRepository.existsByEmail(bootstrapAdmin.email)) {
      return;
    }

    await this.usersService.create(
      {
        email: bootstrapAdmin.email,
        password: bootstrapAdmin.password,
        firstName: 'Site',
        lastName: 'Administrator',
        roles: [UserRole.User, UserRole.Admin],
      },
      true,
    );

    this.logger.log(`Bootstrapped administrator ${bootstrapAdmin.email}`);
  }
}
