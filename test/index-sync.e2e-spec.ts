import { IndexSyncService } from '../src/database/index-sync.service';
import { Harness, startHarness } from './utils/app-harness';

/**
 * `autoIndex` is off, so these indexes exist only because `IndexSyncService`
 * builds them. If it stops, the API still returns the right rows — it just
 * scans to do it, which no functional test would notice.
 */
describe('Declared indexes are built, not assumed (e2e)', () => {
  let harness: Harness;
  let sync: IndexSyncService;

  const indexNames = async (collection: string): Promise<string[]> =>
    (await harness.connection.collection(collection).indexes())
      .map((index) => index.name as string)
      .sort();

  beforeAll(async () => {
    harness = await startHarness('e2e-index-sync');
    sync = harness.app.get(IndexSyncService);
  }, 120_000);

  afterAll(async () => {
    await harness?.stop();
  });

  it('has already built every declared index by the time boot finishes', async () => {
    // The lifecycle hook ran during `app.init()`; nothing here triggers it.
    expect(await indexNames('users')).toContain('active_users_by_created');
    expect(await indexNames('notes')).toContain('own_notes_by_created');
    expect(await indexNames('notes')).toContain('all_notes_by_created');
    expect(await indexNames('posts')).toContain('posts_by_author_created');
    expect(await indexNames('refresh_tokens')).toContain(
      'uniq_refresh_token_hash',
    );
  });

  it('is a no-op against a database that is already current', async () => {
    const reports = await sync.sync();

    expect(reports.flatMap((report) => report.created)).toEqual([]);
    expect(reports.flatMap((report) => report.dropped)).toEqual([]);
  });

  it('rebuilds an index that went missing, and says which one', async () => {
    await harness.connection
      .collection('notes')
      .dropIndex('own_notes_by_created');
    expect(await indexNames('notes')).not.toContain('own_notes_by_created');

    const reports = await sync.sync();

    expect(await indexNames('notes')).toContain('own_notes_by_created');
    expect(reports.flatMap((report) => report.created)).toEqual([
      'own_notes_by_created',
    ]);
  });

  it('leaves an undeclared index alone unless asked to prune', async () => {
    await harness.connection
      .collection('notes')
      .createIndex({ color: 1 }, { name: 'stale_leftover' });

    expect((await sync.sync()).flatMap((report) => report.dropped)).toEqual([]);
    expect(await indexNames('notes')).toContain('stale_leftover');

    const pruned = await sync.sync(true);

    expect(pruned.flatMap((report) => report.dropped)).toEqual([
      'stale_leftover',
    ]);
    expect(await indexNames('notes')).not.toContain('stale_leftover');
  });
});
