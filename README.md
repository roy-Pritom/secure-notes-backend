# Secure Notes API

A note-taking backend with JWT authentication and role-based access control, built on
NestJS and MongoDB.

- **Database** — MongoDB with Mongoose
- **Authentication** — JWT access and refresh tokens, with rotation
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
pnpm install
pnpm start:dev
```

Swagger UI is at `/api/docs` outside production.

Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` to have the first
administrator created on boot; an empty database otherwise has no account able to
promote anyone. It runs once and is a no-op on every later boot.

```bash
pnpm test         # unit
pnpm test:e2e     # end-to-end, on an in-memory mongod
pnpm typecheck && pnpm lint && pnpm build
```

## API

All routes are versioned under `/api/v1`. Every route needs a valid `x-api-key`
header once `API_KEYS` is set — the health probes are the only exception — and a
bearer token on top of that unless marked public. Every list endpoint takes `page`,
`limit` (≤ 100) and `sortOrder`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Create an account and sign in |
| POST | `/auth/login` | public | Exchange credentials for a token pair |
| POST | `/auth/refresh` | public | Rotate an expiring token pair |
| POST | `/auth/logout` | any | End the current session |
| GET | `/profile` | any | My profile |
| PATCH | `/profile` | any | Update my name or interests |
| PATCH | `/profile/password` | any | Change my password |
| POST | `/notes` | any | Create a note |
| GET | `/notes` | any | List my notes |
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

## Indexing

Six indexes across three collections, each tied to one access path. The full table,
with the reasoning for every index and for the ones deliberately left out, is on page
two of [`docs/ERD.pdf`](docs/ERD.pdf).

| Collection | Index | Keys |
| --- | --- | --- |
| users | `uniq_active_email` | `{ email: 1 }` unique, partial on `deletedAt: null` |
| users | `active_users_by_created` | `{ deletedAt: 1, createdAt: -1 }` |
| users | `active_users_by_interest` | `{ deletedAt: 1, interests: 1 }` |
| notes | `own_notes_by_created` | `{ owner: 1, deletedAt: 1, createdAt: -1 }` |
| notes | `all_notes_by_created` | `{ deletedAt: 1, createdAt: -1 }` |
| posts | `posts_by_author_created` | `{ author: 1, createdAt: -1 }` |

Single-document reads go through `_id`, which MongoDB already indexes. The request
surface is kept inside what these cover: there is no free-text search and no `sortBy`
parameter, so no query can ask for an ordering no index provides. An e2e test asserts
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

## Security

- **Client keys** — an `x-api-key` gate in front of everything but the probes. Only
  the SHA-256 digests are held in memory, the comparison is timing-safe, and missing
  and wrong keys return the same message, so the header cannot be probed.
- **Passwords** — bcrypt with a configurable cost; the hash is `select: false` and is
  stripped again at serialization, so it cannot leak through a forgotten projection.
- **Tokens** — access and refresh are signed with *different* secrets, and the
  environment refuses to boot if they match. Each carries a `jti`, so two tokens
  minted in the same second are never byte-identical.
- **Refresh rotation** — only the SHA-256 digest of the live refresh token is stored.
  Replaying a spent token drops the whole session. bcrypt is not used here on purpose:
  it truncates at 72 bytes and would compare only a JWT's near-identical header.
- **Session invalidation** — changing a password, or an admin changing roles or
  status, clears the stored digest and ends every other session.
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
