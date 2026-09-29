import { GUARDS_METADATA } from '@nestjs/common/constants';

import { HealthController } from '../../health/health.controller';
import { AuthController } from '../../modules/auth/auth.controller';
import { NotesController } from '../../modules/notes/notes.controller';
import { PostsController } from '../../modules/posts/posts.controller';
import { ProfileController } from '../../modules/users/profile.controller';
import { UsersController } from '../../modules/users/users.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const guardsOf = (controller: object): unknown[] =>
  (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? [];

/**
 * The guards are declared per controller rather than bound globally, which is
 * explicit but means a forgotten `@UseGuards` would silently expose a whole
 * controller. This is the net under that: a new controller must appear here.
 */
describe('controller guard coverage', () => {
  const guarded = [
    ['AuthController', AuthController],
    ['NotesController', NotesController],
    ['PostsController', PostsController],
    ['ProfileController', ProfileController],
    ['UsersController', UsersController],
  ] as const;

  it.each(guarded)('%s declares both auth guards', (_name, controller) => {
    expect(guardsOf(controller)).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('orders JwtAuthGuard before RolesGuard everywhere', () => {
    // RolesGuard reads `request.user`, which only JwtAuthGuard puts there.
    for (const [, controller] of guarded) {
      const guards = guardsOf(controller);
      expect(guards.indexOf(JwtAuthGuard)).toBeLessThan(
        guards.indexOf(RolesGuard),
      );
    }
  });

  it('leaves the health probes unguarded, as the one deliberate exception', () => {
    expect(guardsOf(HealthController)).toEqual([]);
  });
});
