# Production backend on App Platform

Production runs on the DigitalOcean App Platform app `verse-mate-backend`, from one image
(`verse-mate-backend-backend:main`, pushed by CI on every merge to `main`, deployed on push).
The app has two components that run that image in different roles:

| Component | Kind | Role (`VERSEMATE_ROLE`) | What it runs | Size | Cost |
| --- | --- | --- | --- | --- | --- |
| `verse-mate-backend-backend` | service | `api` | the image CMD: migrator, coach deploy step (`timeout 300`), then the API on port 3000 at `api.versemate.org`; no background worker | `apps-s-1vcpu-1gb-fixed` | $10/month |
| `verse-mate-backend-worker` | worker | `worker` | `bun --bun run ./dist/index.js`: no migrator, no coach step; waits for the image's migrations, then every BullMQ worker and cron; listens on port 3000 for its liveness check only (no route, no domain) | `apps-s-1vcpu-2gb` | $25/month |

Total: $35 a month (App Platform's quote on 2026-10-19). Before the split it was $10, one
service running everything.

The roles:

- `api`: serves HTTP, refreshes the language statistics at start, runs no worker, schedules
  no cron and does not re-queue batch monitoring.
- `worker`: before any worker or cron, waits until the database holds every migration in its
  image's `migrations` folder, re-reading every 5 s and logging
  `[QUEUE] waiting for N pending migration(s)`. After 15 minutes, or at once if the folder is
  missing, it exits 1 and App Platform restarts it. Then it starts all nine workers, registers
  the six crons and re-queues monitoring for active OpenAI batches.
- `all` (nothing set): both, in one process. Local development and any single-container copy.
- Anything else, including the earlier `media-worker`: the API process exits 1 at start,
  naming the value, before it listens or starts a worker. A mistyped role fails the deploy
  instead of putting the workers back on the API. On the service, the image CMD has already
  run the migrator and the coach step by then; both are safe to repeat.

The role is understood by images built from the commit that added this page onward. An older
image reads `worker` as unknown and runs as `all`, and its `api` still runs the batch, verse
notification and coach reminder workers.

**After every edit to the app spec, check that the service still has `VERSEMATE_ROLE=api`.**
A service with the variable removed runs as `all`: every worker on the API's 1 GB again, beside
the worker component. A coach intake run on that 1 GB is what took the API down on 2026-10-19.

## Environment

Every variable stays at the app level, shared by both components, except these, set on each
component:

| Variable | Service | Worker |
| --- | --- | --- |
| `VERSEMATE_ROLE` | `api` | `worker` |
| `PG_POOL_MAX` | `6` | `4` |
| `FIREFLIES_API_KEY` (secret) | not set | set, once the split is verified (step 6) |

Credentials only a worker uses belong on the worker component, not at the app level, so the
service never holds them: if its role is lost, intake still cannot run on it.

The managed Postgres allows 25 connections, of which DigitalOcean keeps a few for its own
superuser; check what is left for the app before the first apply:

```sql
show max_connections;
show superuser_reserved_connections;
```

Steady state is at most 10 (6 + 4), as with the single service's pool of 10. During a deploy
an old and a new instance of each component run side by side, so at most 20, plus the
migrator's and the coach step's few on the new service's start and any operator session.
Raise either value only after checking that sum against what the query above leaves.

## Health checks

| Component | Check | Path, port | Initial delay | Period | Timeout | Failures |
| --- | --- | --- | --- | --- | --- | --- |
| service | readiness (`health_check`) | `/health` | 30 s | 10 s | 5 s | 33 |
| service | liveness (`liveness_health_check`) | `/health` | 360 s | 10 s | 5 s | 9 |
| worker | liveness (`liveness_health_check`) | `/health`, 3000 | 30 s | 30 s | 5 s | 3 |

The service's readiness check allows 30 + 33 x 10 = 360 s before a new instance counts as
failed. A start can spend up to 300 s in the coach deploy step (its `timeout`), up to 10 s on
the Redis check, and the rest on the migrator and boot. The old check (90 s, 9 failures, 180 s)
was shorter than the coach step's own limit. A fast start still goes live at its first passing
check. The liveness check restarts a running API that stops answering within about 90 s, and
only once the 360 s start window has passed.

The worker's check shows its event loop answering, not that its queues are processing: a
worker that lost Redis but still serves HTTP is not caught. A worker blocked for 90 s or more
is restarted, and BullMQ retries the job it held once its lock lapses.

## Spec fragments

Edit the saved spec (below) rather than writing one from scratch: it carries the domain, the
image and the app-level variables. The service gains:

```yaml
services:
  - name: verse-mate-backend-backend
    # existing fields (image, http_port 3000, instance size, routes) unchanged
    envs:
      - key: VERSEMATE_ROLE
        scope: RUN_TIME
        value: api
      - key: PG_POOL_MAX
        scope: RUN_TIME
        value: "6"
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      failure_threshold: 33
    liveness_health_check:
      http_path: /health
      initial_delay_seconds: 360
      period_seconds: 10
      timeout_seconds: 5
      failure_threshold: 9
```

And the app gains a worker, with the same `image` block as the service:

```yaml
workers:
  - name: verse-mate-backend-worker
    image:
      registry_type: DOCR
      repository: verse-mate-backend-backend
      tag: main
      deploy_on_push:
        enabled: true
    run_command: bun --bun run ./dist/index.js
    instance_size_slug: apps-s-1vcpu-2gb
    instance_count: 1
    envs:
      - key: VERSEMATE_ROLE
        scope: RUN_TIME
        value: worker
      - key: PG_POOL_MAX
        scope: RUN_TIME
        value: "4"
    liveness_health_check:
      http_path: /health
      port: 3000
      initial_delay_seconds: 30
      period_seconds: 30
      timeout_seconds: 5
      failure_threshold: 3
```

The run command is relative to the image's `WORKDIR` (`/app`).

## Applying the split

The role code ships first. With no role set, the merged image runs as before (`all`).

1. **Confirm the merged image.** The newest deployment is ACTIVE, `GET /health` answers 200,
   and the service's log shows the nine `[QUEUE] ... worker started successfully` lines.
   Check that no component sets `VERSEMATE_ROLE` yet (an old `media-worker` value would now
   stop it from starting).
2. **Save the current spec** to a file outside every repository, readable only by you. It is
   the rollback copy. Variables of type `SECRET` come out encrypted, anything else in plain
   text, so check every credential is a `SECRET` and keep the files out of synced folders.

   ```bash
   umask 077
   doctl apps list                                   # the app id
   doctl apps spec get <app-id> --format yaml > ~/verse-mate-backend.spec.before.yaml
   ```

3. **Write the new spec** from a copy of the saved one, with the fragments above, and validate
   it against the app without applying it. The proposal echoes the components, the health
   checks and the monthly cost; check them against the tables above ($35).

   ```bash
   doctl apps propose --app <app-id> --spec ~/verse-mate-backend.spec.new.yaml
   ```

4. **Apply it.** Both components deploy as one deployment.

   ```bash
   doctl apps update <app-id> --spec ~/verse-mate-backend.spec.new.yaml
   ```

   Through the deployment, poll `GET https://api.versemate.org/health` and one chapter read
   every 5 s. Every poll should answer 200.

5. **Verify.**
   - The deployment is ACTIVE (`doctl apps list-deployments <app-id>`).
   - The service's log (`doctl apps logs <app-id> verse-mate-backend-backend`) shows the
     migrator, the coach step, `[QUEUE] No BullMQ workers in this process (role: api)` and the
     language statistics refresh.
   - The worker's log (`doctl apps logs <app-id> verse-mate-backend-worker`) shows no migrator
     run, any `[QUEUE] waiting for N pending migration(s)` lines ending,
     `[QUEUE] Starting BullMQ workers (role: worker)...` and the nine workers started.
   - The connection count across the whole cluster at the deploy's peak stays within the
     budget above:
     `select count(*) from pg_stat_activity where backend_type = 'client backend';`
   - The next scheduled job (a verse notification) is logged by the worker only.
   - Restart the worker once (`doctl apps restart <app-id> --components verse-mate-backend-worker`):
     the API keeps answering and the worker starts its queues again.

6. **Turn coach intake back on** only after step 5: add `FIREFLIES_API_KEY` to the worker
   component's `envs` as `type: SECRET` (not at the app level), apply, and watch the next
   intake tick in the worker's log while polling `/health` and a chapter read every 5 s. The
   API should answer every poll and not restart.

Once the split has run for a while, delete both spec files.

## Rollback

Put the saved spec back:

```bash
doctl apps update <app-id> --spec ~/verse-mate-backend.spec.before.yaml
```

The worker component goes away and the service runs as `all` from its image CMD, as before
the split. The role code needs no revert. The saved spec predates step 6, so it carries no
`FIREFLIES_API_KEY`: leave it unset while one service runs every worker, or the 2026-10-19
outage comes back.

## Rolling back to an older image

An image older than the newest migration in the database cannot start the service: its
migrator refuses a database holding migrations its folder lacks (see
`coach-migration-rollback.md`). For that deploy, set the service's run command to
`bun --bun run ./dist/index.js` so it skips the migrator, and remove the run command again on
the next deploy of a current image. The worker needs nothing for that: the older image's
migrations are a subset of what the database holds, so it finds none pending and starts.

An image from before the split does not know the roles (see above): roll the spec back with
it, so a single service runs everything as it did then.

## Migrations

Every migration must be additive (it adds tables, columns or functions and removes or rewrites
nothing the previous version reads). During a deploy the old components keep running on the
migrated schema, and if the new service fails after migrating, the previous version keeps
serving on it. A migration that is not additive needs its own staged deploy.

A migration expected to take longer than 30 s is applied ahead of its deploy, so it is already
done when the image starts and the service's start stays inside its 360 s window. Apply it
only from the merged commit, never from a branch: a migration the database ran that `main`
never gets (a PR changed in review, abandoned, or overtaken by a later-dated migration) makes
the next image's migrator refuse to start.

1. Turn off `deploy_on_push` on both components and apply the spec.
2. Merge, and wait for CI to push the image.
3. From a clean checkout of that merged commit (`git status --porcelain` empty,
   `git rev-parse HEAD` the image's commit), with the production connection given inline and
   not written to any `.env` file, and the cluster's CA certificate (TLS is verified):

   ```bash
   cd packages/database
   POSTGRES_URL='<production url>' POSTGRES_CA_CERT="$(cat <ca file>)" bun run migrate:deploy
   ```

   If your address had to be added to the cluster's trusted sources, remove it afterwards.
4. Deploy (`doctl apps create-deployment <app-id>`), then turn `deploy_on_push` back on. The
   service's migrator finds nothing pending, and the worker's wait passes at once.
