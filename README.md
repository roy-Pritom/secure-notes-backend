# Secure Notes API

A note-taking backend with JWT authentication and role-based access control, built on
NestJS and MongoDB.

- **Database** — MongoDB with Mongoose
- **Authentication** — JWT access and refresh tokens, with rotation
- **Sessions** — one `refresh_tokens` row per issued token, so a user can be signed
  in on several devices and each session can be revoked on its own
- **Passwords** — bcrypt, cost 12 by default
- **Indexes** — every one declared with `schema.index(…)`, one per named query

The entity diagram and the full index catalogue are in [`docs/ERD.pdf`](docs/ERD.pdf)
(source: [`docs/erd.html`](docs/erd.html)).

## Roles

| Capability | User | Admin |
| --- | :---: | :---: |
| Create, update, delete, list own notes | ✅ | ✅ |
| Read any note | — | ✅ |
| Edit or delete another user's note | — | — |
| Add, update, remove, list users | — | ✅ |
| Users grouped by interest | — | ✅ |
| Publish a post, read anyone's posts | ✅ | ✅ |

An admin inherits every user capability: no route requires the `user` role, so an
administrator is simply a user who also passes the admin checks. Reading everyone's
notes is deliberately not the same as editing them — only an owner may write.

## Guards

The three guards and the module that owns them live in
[`src/common/guards`](src/common/guards); the decorators that steer them are in
[`src/common/decorators`](src/common/decorators). Every controller declares its
protection explicitly:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'notes', version: API_VERSION.V1 })
export class NotesController {
  @Roles(UserRole.Admin)
  @Get('all')
  findAll(...)   // admin only
}
```

| Guard | Bound | Answers | Opt out with |
| --- | --- | --- | --- |
| `ApiKeyGuard` | globally | Is this a known client application? | `@SkipApiKey()` |
| `JwtAuthGuard` | per controller | Which user is calling? | `@Public()` |
| `RolesGuard` | per controller | May that user do this? | *(no `@Roles()`)* |

Global guards run before controller-bound ones, so the chain is throttle → client
key → bearer token → role. The order is what makes it useful: an unknown client is
turned away before any credential is read, which is why `@Public()` does **not**
exempt a route from the key — `login` and `register` are public to people, not to
anonymous clients.

`JwtAuthGuard` resolves the token onto `request.user`, which is why it is always
listed first: `RolesGuard` and the `@CurrentUser()` / `@CurrentUserId()` decorators
read what it puts there. A route with no `@Roles()` passes for any authenticated
caller, which is how an admin inherits every user capability without a single
`@Roles(UserRole.User)` anywhere. Ownership is deliberately *not* a guard — it
depends on the record, so `NotesService` enforces it where the note is already
loaded.

`GuardsModule` is `@Global()` because `@UseGuards()` resolves guards from the
*controller's* module; without it every feature module would have to import a module
just to protect its own routes. `HealthController` is the one controller with no
`@UseGuards` — probes answer before anyone has a token — and
[`controller-guards.spec.ts`](src/common/guards/controller-guards.spec.ts) fails if
any other controller is left unguarded.

Client keys come from `API_KEYS` (comma-separated, one per client). Leave it empty and
the gate is inert — convenient locally and in the e2e suite — while the environment
refuses to boot in production without at least one key.

## Running it

```bash
cp .env.example .env          # then set JWT_SECRET, JWT_REFRESH_SECRET, API_KEYS
docker compose up -d mongo
npm install
npm run start:dev
```

Swagger UI is at `/api/docs` outside production.

No account is ever created automatically, and the API cannot mint the first
administrator: registration always yields the `user` role, and `PATCH /users/:id`
already requires an admin. So the first one is granted directly in the database.

Register normally, then flip the roles on that document:

```js
// mongosh, or the Atlas UI
db.users.updateOne(
  { email: 'you@example.com', isDeleted: false },
  { $set: { roles: ['user', 'admin'] } },
)
db.refresh_tokens.updateMany(   // force a fresh login so the token carries the role
  { user: db.users.findOne({ email: 'you@example.com' })._id, revokedAt: null },
  { $set: { revokedAt: new Date() } },
)
```

Roles are signed into the access token, so an existing session keeps the old role
until it expires — hence the second statement. Every admin after the first can be
made through `PATCH /users/:id`.

```bash
npm test              # unit
npm run test:e2e      # end-to-end, on an in-memory mongod
npm run typecheck && npm run lint && npm run build
```

## API

All routes are versioned under `/api/v1`. Every route needs a valid `x-api-key`
header once `API_KEYS` is set — the health probes are the only exception — and a
bearer token on top of that unless marked public. Every list endpoint takes `page`,
`limit` (≤ 100) and `sortOrder`. The two note listings take `tag`, `pinned` and
`archived` on top of those.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Create an account and sign in |
| POST | `/auth/login` | public | Exchange credentials for a token pair |
| POST | `/auth/refresh` | public | Rotate an expiring token pair |
| POST | `/auth/logout` | any | Revoke every session for the caller |
| GET | `/profile` | any | My profile |
| PATCH | `/profile` | any | Update my name, avatar, bio or interests |
| PATCH | `/profile/password` | any | Change my password |
| POST | `/notes` | any | Create a note |
| GET | `/notes` | any | List my notes — pinned first, then newest |
| GET | `/notes/:id` | owner / admin | Read one note |
| PATCH | `/notes/:id` | owner | Update a note |
| DELETE | `/notes/:id` | owner | Delete a note |
| GET | `/notes/all` | admin | List everyone's notes |
| POST | `/users` | admin | Add a user, with roles |
| GET | `/users` | admin | List all users |
| GET | `/users/:id` | admin | Read one user |
| PATCH | `/users/:id` | admin | Update a user, roles and status included |
| DELETE | `/users/:id` | admin | Remove a user |
| GET | `/users/interests` | admin | **Scenario 1** — users grouped by interest |
| GET | `/users/:id/posts` | any | **Scenario 2** — a user's posts via `$lookup` |
| POST | `/posts` | any | Publish a post |
| GET | `/health`, `/health/liveness`, `/health/readiness`, `/health/ping` | public | Probes |

A note that belongs to someone else answers `404`, not `403`: ownership must not be
probeable. Editing someone else's note — including as an admin — answers `403`.

### Fields beyond the essentials

A note carries `tags` (up to 10, stored trimmed and lowercased so `?tag=Chess` and
`?tag=chess` are one filter), `isPinned`, `isArchived` and a `color` drawn from a
fixed palette. Pinned notes lead every listing; archived ones are kept but stay out
of it until `archived=true` asks for them. A post carries `tags`, a `status` of
`draft` or `published`, the `publishedAt` stamp that goes with it, and an `excerpt`
cut from the body on a word boundary when the author does not write one. A user
carries `avatarUrl`, `bio` and `passwordChangedAt` — stamped at registration and on
every change, so a client can show the age of a password.

Each of these is filterable, sortable or rendered somewhere: nothing is stored that
no route reads. Deliberately absent are a note's collaborators and version history —
sharing is out of scope for the brief, and neither is a single field.

## Indexing

Ten indexes across four collections, each tied to one access path. The full table,
with the reasoning for every index and for the ones deliberately left out, is on page
two of [`docs/ERD.pdf`](docs/ERD.pdf).

| Collection | Index | Keys |
| --- | --- | --- |
| users | `uniq_active_email` | `{ email: 1 }` unique, partial on `isDeleted: false` |
| users | `active_users_by_created` | `{ isDeleted: 1, createdAt: -1 }` |
| users | `active_users_by_interest` | `{ isDeleted: 1, interests: 1 }` |
| notes | `own_notes_by_created` | `{ owner: 1, isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 }` |
| notes | `own_notes_by_tag` | `{ owner: 1, isDeleted: 1, tags: 1 }` |
| notes | `all_notes_by_created` | `{ isDeleted: 1, isArchived: 1, isPinned: -1, createdAt: -1 }` |
| posts | `posts_by_author_created` | `{ author: 1, isDeleted: 1, createdAt: -1 }` |
| refresh_tokens | `uniq_refresh_token_hash` | `{ tokenHash: 1 }` unique |
| refresh_tokens | `user_sessions_by_expiry` | `{ user: 1, expiresAt: 1 }` |
| refresh_tokens | `expired_sessions_ttl` | `{ expiresAt: 1 }` TTL, 24 h after expiry |

The two note listing indexes end in the sort keys they are read with — `isPinned`
before `createdAt` — with the `isArchived` equality ahead of both, so a default page
is an index seek rather than an in-memory sort. `?sortOrder=asc` is the one exception:
it flips `createdAt` but not `isPinned`, which is neither the index order nor its
exact reverse, so that page is sorted in memory. It is bounded by one owner's notes
and a `limit` of 100, and it is the rarer request — a second index for it would cost
more on every write than it saves on that read.

Single-document reads go through `_id`, which MongoDB already indexes. The request
surface is otherwise kept inside what these indexes cover: there is no free-text
search and no `sortBy` parameter. An e2e test asserts
the deployed index set matches this list exactly.

## Aggregations

Both pipelines live in
[`src/modules/users/aggregations/user.pipelines.ts`](src/modules/users/aggregations/user.pipelines.ts).

**Scenario 1 — users grouped by interests** (`GET /users/interests`). One
`collection.aggregate()` call and nothing else:

```
$match → $unwind → $group → $sort → $facet → $project
```

The leading `$match` rides `active_users_by_interest`; passing `?interest=chess`
turns it into an exact two-key equality. The `$facet` tail returns the page and the
unpaged total together, so pagination costs no second round trip.

**Scenario 2 — a user's posts** (`GET /users/:id/posts`). A single pipeline with one
`$lookup`:

```
$match → $lookup (posts, sorted and paged in its sub-pipeline) → $unwind → $project
```

`$match` on `_id`; the join uses `posts_by_author_created` on `author`, and the
sub-pipeline's `$sort: { createdAt: -1 }` is that same index's trailing key, so the
ordering is read rather than computed.

## Soft deletion

Nothing is ever removed. `BaseSchema` gives `users`, `notes` and `posts` two
fields: `isDeleted`, the flag every read filters on, and `deletedAt`, the audit
timestamp. A delete sets both; a read filters `isDeleted: false`.

The filter is applied in one place per collection — the repository's private
`live()` helper, which every query passes through — so a listing cannot include
deleted rows by forgetting a clause. Repositories are the only classes that touch
a collection, which is what makes that hold.

`isDeleted` is an equality key inside each listing index, ahead of the sort key,
so an active-only listing is still an index seek. `uniq_active_email` is partial
on `isDeleted: false`, so deleting an account frees its address for reuse — which
is why `unique: true` must not also be declared on the `email` prop: that would
build a second, unconditional index and lock the address forever.

Deleting an account cascades: its sessions are revoked and its notes and posts are
flagged in the same step, because MongoDB has no `onDelete`. Without it a deleted
user's notes would stay in the admin `GET /notes/all` listing, which filters notes
and never joins the owner. The user row is flagged first, so a partial failure
leaves content orphaned but unreachable, never an account that still works.

Posts carry the fields, are filtered on read (including through the `$lookup` in
`GET /users/:id/posts`) and are covered by the cascade, but have no delete route of
their own yet.

**Existing databases** need a one-time backfill, since documents written before
this have no `isDeleted` field and would not match `isDeleted: false`:

```js
db.users.updateMany({ isDeleted: { $exists: false } }, [
  { $set: { isDeleted: { $ne: ['$deletedAt', null] } } },
]);
// same for notes; posts take { $set: { isDeleted: false } }
```

## Security

- **Client keys** — an `x-api-key` gate in front of everything but the probes. Only
  the SHA-256 digests are held in memory, the comparison is timing-safe, and missing
  and wrong keys return the same message, so the header cannot be probed.
- **Passwords** — bcrypt with a configurable cost; the hash is `select: false` and is
  stripped again at serialization, so it cannot leak through a forgotten projection.
- **Tokens** — access and refresh are signed with *different* secrets, and the
  environment refuses to boot if they match. Each carries a `jti`, so two tokens
  minted in the same second are never byte-identical.
- **Refresh rotation** — each issued token gets a row in `refresh_tokens` holding
  only its SHA-256 digest, so a database dump contains nothing replayable. bcrypt is
  not used here on purpose: it truncates at 72 bytes and would compare only a JWT's
  near-identical header. Refreshing spends the row (`revokedAt`) and writes a new one,
  under a `revokedAt: null` compare-and-set, so two concurrent rotations of the same
  token cannot both mint a pair.
- **Reuse detection** — a spent row presented a second time means the token was
  replayed or stolen, so every session that user holds is revoked, not just that one.
  Revoked and unknown tokens return the same message.
- **Session invalidation** — changing a password, or an admin changing roles, status,
  or deleting the account, revokes every row for that user. MongoDB has no cascade,
  so `UsersService` does it explicitly. Expired rows age out through a TTL index a day
  after expiry, leaving a short audit window without unbounded growth.
- **Brute force** — the account locks for 15 minutes after 5 failed logins, and the
  credential endpoints are rate limited well below the global ceiling. A login against
  an unknown address still runs a bcrypt comparison, so timing does not reveal whether
  an account exists, and both failures return the same message.
- **Mass assignment** — the global validation pipe strips unknown properties *and*
  rejects the request that carried them. Self-registration has no `roles` field at
  all, and a note's `owner` comes from the token, never the body.
- **Injection** — `sanitizeFilter` is on globally, route ids are parsed into real
  `ObjectId`s before reaching a query, and `strict: 'throw'` rejects unknown paths
  rather than dropping them silently.
- **Transport and payloads** — helmet, CORS from an allow-list, a 100 kB body limit,
  and exactly one trusted proxy hop so `X-Forwarded-For` cannot be forged past the
  throttler.
