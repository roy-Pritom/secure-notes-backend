# Secure Notes API

NestJS 11 + MongoDB (Mongoose 8) REST API.

## Quick start

```bash
pnpm install
cp .env.example .env          # then set MONGODB_URI and a real JWT_SECRET
docker compose up -d mongo    # or point MONGODB_URI at an existing cluster
pnpm start:dev
```

The app refuses to boot if any environment variable is missing or malformed —
see [`src/config/env.validation.ts`](src/config/env.validation.ts). Swagger UI
is served at `/api/docs` outside production.

## Layout

```
src/
├── config/                  env validation + typed, namespaced config
│   ├── env.validation.ts      fail-fast contract for process.env
│   ├── app|database|security.config.ts
│   └── config.module.ts       the only place env is parsed
├── database/
│   └── mongoose-config.service.ts   connection options, pooling, events
├── health/                  liveness / readiness / full report
│   └── indicators/            custom Mongo connection indicator
├── common/                  shared building blocks
│   ├── dto/                   pagination query + paginated response
│   ├── filters/               single global filter + Mongo error mapper
│   ├── pipes/                 ObjectId parsing, global validation pipe
│   ├── schemas/               BaseSchema, serialization helper
│   ├── transformers/          typed class-transformer helpers
│   ├── validators/            cross-field validators
│   └── types/                 Lean<T>, PaginatedResult<T>, …
└── modules/
    └── users/               one feature module, the template for the rest
        ├── schemas/           Mongoose schema + indexes + methods
        ├── dto/               create / update / query / response
        ├── enums/ types/
        ├── users.repository.ts   all Mongoose access lives here
        ├── users.service.ts      business rules, hashing, conflicts
        └── users.controller.ts   HTTP surface only
```

The rule the layout encodes: **controllers never touch Mongoose, services never
build queries, repositories never make business decisions.** A feature module
exports only its service, so nothing outside `users/` can reach the collection.

## Health endpoints

Excluded from the global prefix and version-neutral, so they stay stable at:

| Endpoint            | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `GET /health`       | Full report: Mongo ping, connection state, heap, RSS      |
| `GET /health/liveness`  | Process only — no dependencies, so a DB outage never restarts healthy pods |
| `GET /health/readiness` | Mongo must be reachable; fails → pod leaves the load balancer |
| `GET /health/ping`  | Cheapest possible check for LB probes                     |

Check them locally:

```bash
curl -s localhost:3000/health | jq        # full report
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/health/readiness
```

A healthy readiness response is `200 {"status":"ok", ...}`; when Mongo is
unreachable it is `503 {"status":"error", "error":{"mongodb-connection":
{"status":"down","state":"disconnected"}}, ...}` — the standard Terminus
payload, which the global exception filter deliberately passes through
unreshaped.

### Kubernetes

```yaml
livenessProbe: # restart only a genuinely wedged process
  httpGet: { path: /health/liveness, port: 3000 }
  initialDelaySeconds: 15
  periodSeconds: 20
  failureThreshold: 3
readinessProbe: # pull out of the Service while Mongo is unreachable
  httpGet: { path: /health/readiness, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 2
startupProbe: # give a slow first connection room before liveness kicks in
  httpGet: { path: /health/ping, port: 3000 }
  periodSeconds: 5
  failureThreshold: 30
```

The split matters: pointing `livenessProbe` at `/health/readiness` is a common
mistake that turns a brief database blip into a rolling restart of every
healthy pod.

### Docker Compose

```yaml
healthcheck:
  test: ['CMD', 'node', '-e', "fetch('http://localhost:3000/health/readiness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 30s
```

## Security posture

- **Env**: validated at boot; `MONGODB_URI` is never logged (errors log `.message` only).
- **Input**: global `whitelist` + `forbidNonWhitelisted` validation, so unknown
  body fields are a `400`, not a silent drop — this is what blocks mass-assignment
  of `roles` / `passwordHash`.
- **Passwords**: bcrypt, cost from config, capped at 72 bytes (bcrypt's real limit);
  `passwordHash` is `select: false` and stripped again at serialization.
- **Queries**: `sanitizeFilter` on, search terms regex-escaped, `sortBy` allow-listed,
  `limit` hard-capped at 100.
- **Errors**: one global filter; non-HTTP exceptions become a bare 500 and the
  stack stays server-side. Duplicate-key errors never echo the offending value.
- **Transport**: helmet, compression, CORS allow-list, 100 kb body cap,
  `trust proxy = 1` so the throttler sees real client IPs.

## Testing

```bash
pnpm test        # unit + integration (real mongod via mongodb-memory-server)
pnpm test:e2e    # boots the real AppModule against an in-memory mongod
pnpm lint
```

Integration and e2e tests run against an actual mongod rather than mocks —
index behaviour, `select: false` and the serialization transform are exactly
the things a mocked model fails to catch.

## Adding a feature module

Copy `src/modules/users/` as the template:

1. Schema extends `BaseSchema`, call `applyDocumentSerialization(schema)`.
2. Register with `MongooseModule.forFeature` — never `forRoot`; the single
   connection is owned by `DatabaseModule`.
3. Repository takes the model, scopes reads to `deletedAt: null`.
4. Export only the service from the module.
5. Declare the controller route explicitly —
   `@Controller({ path: 'notes', version: '1' })` — so the URL it serves is
   visible in the file instead of coming from the global `defaultVersion`.

## Notes / deliberate choices

- **`strictQuery: 'throw'`** — querying a path that is not in the schema raises
  instead of silently matching everything. Strict on purpose; relax it in
  `mongoose-config.service.ts` if a dynamic-path query is ever needed.
- **`autoIndex` / `autoCreate` are off in production** — indexes there should be
  built deliberately by a migration, not on process start.
- **Soft delete** — `deletedAt` plus a partial unique index on `email`, so a
  deleted account keeps its audit row but releases its address.
- **mongoose is pinned to `^8`** — mongoose 9 ships MongoDB driver 7, whose
  handshake metadata is currently broken under Jest, and it removes the
  `FilterQuery` type.
