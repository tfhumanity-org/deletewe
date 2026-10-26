# Working in this repo

## Requirements

- **Node 22+** (24+ recommended). `node:sqlite` is built in, so self-hosting
  needs no native build step.
- npm 10+. The repo uses npm workspaces; there is no pnpm or yarn setup.
- Docker, only for the self-host image.

## Commands

```bash
npm ci                 # install, exactly as the lockfile says
npm run build          # tsc -b across the project reference graph
npm run clean          # when something is inexplicable

npm run verify         # lint + typecheck + 184 tests — THE gate
npm run lint
npm run lint:fix
npm run typecheck
npm test
npm run test:watch

npm run dev            # self-hosted app on :8787  — FOREGROUND, own terminal
npm run mock-broker    # stand-in broker on :8788  — FOREGROUND, own terminal
npm run cli -- help

npm run catalog:validate   # schema + cross-field rules
npm run catalog:report     # coverage breakdown by automation level
npm run broker:new -- <id> # scaffold a definition + fixture directory
npm run schema:emit        # regenerate the JSON Schema for editors
```

`npm run verify` is the only gate that matters. Run it before every commit.

`dev` and `mock-broker` block the terminal. They are separate sessions, not
steps in a sequence. The CLI talks to the same `./data` directory as a running
`dev` server, so you can drive one from the other.

## Layout

```
packages/
  schema/          Broker-definition schema (Zod) + cross-field validator
  catalog/         29 broker YAML files, loader, validator CLI, fixtures
  engine/          Domain core — ports, pipeline, matcher, crypto, store
  browser/         fetch-based and fixture browser drivers (portable)
  adapters-node/   SQLite, file blobs, in-process queue, mail, key file
  adapters-cf/     D1, R2, Queues, Browser Rendering, Email Routing
  web/             Hono + JSX server-rendered app and admin console
  cli/             Self-hoster CLI
apps/
  selfhost/        Node entrypoint (what the Docker image runs)
  worker/          Cloudflare Worker entrypoint + wrangler.toml
  mock-broker/     Stand-in broker for end-to-end tests
tests/             Integration, security, web, e2e, catalogue-fixture suites
docs/              Research, specs, ADRs, this playbook
```

### Dependency direction

```
schema  <-  engine  <-  browser  <-  adapters-{node,cf}  <-  apps
             ^                              ^
             |                              |
          catalog                          web
```

The engine depends on `schema` and nothing else. It cannot import `node:*`, a
Cloudflare package, or an adapter — ESLint fails the build if it does. That rule
is what makes hosted and self-hosted share all of the domain logic.

## Conventions

### TypeScript

- `strict` plus `noUncheckedIndexedAccess`. Both earn their keep.
- Relative imports carry the `.ts` extension; `rewriteRelativeImportExtensions`
  rewrites them to `.js` on emit. The same file runs under `node` and compiles
  under `tsc`.
- `import type` for type-only imports — the lint rule enforces it.
- No `any`. The lint rule is an error, not a warning.

### Comments

Explain *why*, never *what*. A comment that restates the code is noise. The
comments worth writing here record a decision someone would otherwise undo:

```ts
// Deliberately not persisted: a listing we judged is not ours is a
// stranger's data, and keeping it would be the harm we exist to prevent.
discarded++;
continue;
```

### Naming

- Domain language throughout: `listing`, `case`, `mandate`, `broker`,
  `evidence`, `task`. Not `record`, `item`, `entity`.
- Database columns are `snake_case`; TypeScript is `camelCase`; mapping happens
  in the store and nowhere else.

### Tests

- Name the behaviour, not the method: `'never auto-confirms when the member has
  not opted in'`, not `'test bucketFor'`.
- Assert security properties. The most valuable assertion in this repository is
  **"we did not send anything"**.
- Pair every negative assertion with a positive one proving the page or payload
  rendered at all. A test asserting "no PII appears" passes trivially when the
  page is empty — this bit us once already.

## The gates, and why each exists

| Gate | Catches |
| --- | --- |
| `eslint` | Platform imports in the engine, `any`, `console`, unused code |
| `tsc -b` | Type errors across the whole project graph, including tests |
| `vitest` | Behaviour and security properties |
| `catalog:validate` | Definitions that over-collect, reach off-allowlist, or overclaim automation |
| `npm audit --audit-level=high` | Known-vulnerable dependencies. In a project handling other people's identity data that is a product defect, not a chore |
| Docker build in CI | A self-host image that does not boot |

## Deploying

### Self-hosted

```bash
docker compose up --build
```

Back up `data/keys.json`. For anything beyond local use, read the
[self-hosting checklist](../../SECURITY.md#self-hosting-checklist).

### Cloudflare

Not deployed by the build, and not from this session. Before `wrangler deploy`:

1. Create the D1 database and put its id in `apps/worker/wrangler.toml`.
2. Create the R2 bucket `deletewe-evidence`.
3. Create the queue `deletewe-jobs`.
4. Set the secrets:
   ```bash
   wrangler secret put MASTER_KEY    # 64 hex chars, generated offline
   wrangler secret put INDEX_KEY     # 64 hex chars, stored separately
   wrangler secret put MAIL_API_KEY
   ```
5. Point a domain's Email Routing catch-all at the Worker, and set
   `INBOUND_DOMAIN` to it. Without this, email verification cannot complete —
   and that is the step most opt-outs actually hinge on.
6. Confirm the cron trigger exists. Without it nothing is ever re-checked, and
   re-checking is the product.

Migrations run on first request, so no separate migration step is needed.

## Things that will bite you

- **Nothing is sent without a consent *and* a mandate.** If a submit returns
  `{ kind: 'blocked' }` in a test, check both before debugging anything else.
- **The rate limiter counts scans and submits together.** With a frozen test
  clock, a submit right after a scan is correctly blocked. Advance the clock.
- **Long waits are database rows, not timers.** If a re-check never fires,
  look at `case_file.next_check_at` and whether the cron tick is running.
- **Evidence is write-once.** A second `put` to the same key throws
  `storage_conflict`. That is the design, not a bug.
- **Deleting a member destroys their key first.** Nothing is recoverable
  afterwards, including by you.
