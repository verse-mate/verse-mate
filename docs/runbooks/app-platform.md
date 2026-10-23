# Production backend on App Platform

Production runs on the DigitalOcean App Platform app `verse-mate-backend`, from one image
(`verse-mate-backend-backend:main`, pushed by CI on every merge to `main`, deployed on push).
The app has two components that run that image in different roles:

| Component | Kind | Role (`VERSEMATE_ROLE`) | What it runs | Size | Cost |
| --- | --- | --- | --- | --- | --- |
| `verse-mate-backend-backend` | service | `api` | the image CMD: migrator, then the API on port 3000 at `api.versemate.org`; no background worker | `apps-s-1vcpu-1gb-fixed` | $10/month |
| `verse-mate-backend-worker` | worker | `worker` | `bun --bun run ./dist/index.js`: no migrator; waits for the image's migrations, then every BullMQ worker and cron; listens on port 3000 for its liveness check only (no route, no domain) | `apps-s-1vcpu-2gb` | $25/month |

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
  run the migrator by then; it is safe to repeat.

The role is understood by images built from the commit that added this page onward. An older
image reads `worker` as unknown and runs as `all`, and its `api` still runs the batch, verse
notification and coach reminder workers.

**After every edit to the app spec, check that the service still has `VERSEMATE_ROLE=api`.**
A service with the variable removed runs as `all`: every worker on the API's 1 GB again, beside
the worker component. The service also holds the Fireflies key (see Environment), so it would
run coach intake on that 1 GB, which is what took the API down on 2026-10-19.

## Environment

Every variable is set at the app level and shared by both components, secrets included
(`FIREFLIES_API_KEY` among them). The one variable set on each component is the role, which
picks the entrypoint:

| Variable | Service | Worker |
| --- | --- | --- |
| `VERSEMATE_ROLE` | `api` | `worker` |

The run command differs too (the service runs the image CMD, the worker runs `index.js`, see
below). Nothing else does: a credential only the worker uses is still visible to the service,
and what keeps the service from running intake is its role, so the role check after every spec
edit (above) matters.

`PG_POOL_MAX` is `5` at the app level, so each component opens a pool of up to 5.

The managed Postgres allows 25 connections, of which DigitalOcean keeps a few for its own
superuser; check what is left for the app before the first apply:

```sql
show max_connections;
show superuser_reserved_connections;
```

Steady state is at most 10 (5 + 5), as with the single service's pool of 10. During a deploy
an old and a new instance of each component run side by side, so at most 20, plus the
migrator's few on the new service's start and any operator session.
Raise the value only after checking that sum against what the query above leaves: it applies
to both components, so each step up adds 2 connections in steady state and 4 during a deploy.

## Health checks

| Component | Check | Path, port | Initial delay | Period | Timeout | Failures |
| --- | --- | --- | --- | --- | --- | --- |
| service | readiness (`health_check`) | `/health` | 30 s | 10 s | 5 s | 33 |
| service | liveness (`liveness_health_check`) | `/health` | 360 s | 10 s | 5 s | 9 |
| worker | liveness (`liveness_health_check`) | `/health`, 3000 | 30 s | 30 s | 5 s | 3 |

The service's readiness check allows 30 + 33 x 10 = 360 s before a new instance counts as
failed. A start runs the migrator, up to 10 s on the Redis check, then boots the API; a normal
start takes well under a minute. The 360 s window was sized for a 300 s step that ran between
the migrator and the API and has since been removed. It is kept because a fast start still goes
live at its first passing check, so the extra room costs nothing, and lowering it is its own
operations change. The liveness check restarts a running API that stops answering within about
90 s, and only once the 360 s start window has passed.

The worker's check shows its event loop answering, not that its queues are processing: a
worker that lost Redis but still serves HTTP is not caught. A worker blocked for 90 s or more
is restarted, and BullMQ retries the job it held once its lock lapses.

## Spec fragments

Edit the saved spec (below) rather than writing one from scratch: it carries the domain, the
image and the app-level variables. Set the app-level `PG_POOL_MAX` to `"5"`: unset, each
component opens a pool of up to 10. The service gains:

```yaml
services:
  - name: verse-mate-backend-backend
    # existing fields (image, http_port 3000, instance size, routes) unchanged
    envs:
      - key: VERSEMATE_ROLE
        scope: RUN_TIME
        value: api
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
   checks and the monthly cost; check them against the tables above ($35), and that the app-level
   `PG_POOL_MAX` is `"5"`.

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
     migrator, `[QUEUE] No BullMQ workers in this process (role: api)` and the
     language statistics refresh.
   - The worker's log (`doctl apps logs <app-id> verse-mate-backend-worker`) shows no migrator
     run, any `[QUEUE] waiting for N pending migration(s)` lines ending,
     `[QUEUE] Starting BullMQ workers (role: worker)...` and the nine workers started.
   - The connection count across the whole cluster at the deploy's peak stays within the
     budget above:

     ```sql
     select usename, datname, count(*)
     from pg_stat_activity
     where datname is not null and usename is not null
     group by rollup (usename, datname)
     order by usename nulls last, datname nulls last;
     ```

     The last row is the total, one row per role and database above it: the app's rows are
     its own role's, `postgres` and `_dodb` are DigitalOcean's, held on the reserved
     superuser slots.
     Don't filter on `backend_type`, `state` or `client_addr`: a role without
     `pg_read_all_stats` (the read-only role, for one) sees those as null for every other
     role's session, so such a filter counts only its own. `usename`, `datname` and `pid`
     stay visible to every role. Background processes have no `datname`, autovacuum workers
     no `usename`, so the filter leaves client sessions. It still counts parallel query
     workers, which don't take a connection slot; they last as long as one query, so read
     the count twice before trusting a peak.
   - The next scheduled job (a verse notification) is logged by the worker only.
   - Restart the worker once (`doctl apps restart <app-id> --components verse-mate-backend-worker`):
     the API keeps answering and the worker starts its queues again.

6. **Turn coach intake back on** only after step 5: add `FIREFLIES_API_KEY` to the app-level
   `envs` as `type: SECRET` and apply (both components redeploy). Watch the next intake tick in
   the worker's log while polling `/health` and a chapter read every 5 s. Every poll should
   answer 200, and the service's log should show no intake run.

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

An image from before the coaching dataset left the repository still carries it, and its start
command loads it into the coach tables between the migrator and the API. Against a store that
already holds it, that changes nothing. Roll back by redeploying such an image tag, never by
reverting the commit that removed the dataset: a revert would commit it again.

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
