#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Rehearse the coach deploy on a copy of a database, offline.

  scripts/coach-deploy-rehearsal.sh run --dump <file> [options]
      Restore the dump into a throwaway Postgres on an internal Docker network
      (no internet), run this branch's image start sequence against it, check
      the results, then roll back to main's image. Writes report.md and the
      evidence files to --out.

  scripts/coach-deploy-rehearsal.sh synthetic-dump --out <file> [options]
      Build a database from main's schema with synthetic accounts that exercise
      every confirmation case, and dump it (pg_dump -Fc) for a test run.

Options:
  --out <path>             run: output directory (default: a new temp dir)
  --branch-image <tag>     image of this branch (default: built from this checkout)
  --main-image <tag>       image of main (default: built from origin/main)
  --postgres-image <tag>   default postgres:15.4-alpine; match production's major
                           version, pg_restore refuses a dump from a newer one
  --keep                   leave the containers running for inspection

The dump may hold real people's data: keep --out on this machine.
USAGE
}

COMMAND="${1:-}"
[ -n "$COMMAND" ] && shift
DUMP="" OUT="" BRANCH_IMAGE="" MAIN_IMAGE="" KEEP=0
PG_IMAGE="postgres:15.4-alpine"
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --branch-image) BRANCH_IMAGE="$2"; shift 2 ;;
    --main-image) MAIN_IMAGE="$2"; shift 2 ;;
    --postgres-image) PG_IMAGE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
NAME="coach-rehearsal-$$"
NET="$NAME-net" PG="$NAME-db" REDIS="$NAME-redis" API="$NAME-api"
DB_URL="postgresql://rehearsal:rehearsal@$PG:5432/rehearsal"
PASSWORD="rehearsal-pass-1"
WORK="$(mktemp -d)"

log() { printf '\n== %s\n' "$*" >&2; }
die() { echo "FAILED: $*" >&2; exit 1; }
now() { python3 -c 'import time; print(time.time())'; }
since() { python3 -c "print(f'{$(now) - $1:.1f}')"; }

cleanup() {
  if [ "$KEEP" = 1 ]; then
    echo "kept: containers $PG $REDIS ${API}*, network $NET" >&2
  else
    docker rm -f "$API" "$API-main" "$PG" "$REDIS" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

build_image() {
  local dir="$1" tag="$2"
  log "building $tag from $dir"
  (cd "$dir" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null)
  (cd "$dir/apps/backend" && bun run build >/dev/null)
  (cd "$dir/packages/database" && bun run build >/dev/null)
  docker build -q -f "$dir/apps/backend/Dockerfile" -t "$tag" "$dir" >/dev/null
}

branch_image() {
  if [ -z "$BRANCH_IMAGE" ]; then
    BRANCH_IMAGE="$NAME-branch:$(git -C "$REPO" rev-parse --short HEAD)"
    build_image "$REPO" "$BRANCH_IMAGE"
  fi
}

main_image() {
  if [ -z "$MAIN_IMAGE" ]; then
    git -C "$REPO" fetch -q origin main
    MAIN_IMAGE="$NAME-main:$(git -C "$REPO" rev-parse --short origin/main)"
    mkdir -p "$WORK/main"
    git -C "$REPO" archive origin/main | tar -x -C "$WORK/main"
    build_image "$WORK/main" "$MAIN_IMAGE"
  fi
}

start_db() {
  docker network create --internal "$NET" >/dev/null
  docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_USER=rehearsal -e POSTGRES_PASSWORD=rehearsal \
    -e POSTGRES_DB=rehearsal "$PG_IMAGE" >/dev/null
  docker run -d --name "$REDIS" --network "$NET" valkey/valkey:8-alpine >/dev/null
  for _ in $(seq 60); do
    docker exec "$PG" pg_isready -U rehearsal -d rehearsal >/dev/null 2>&1 && return
    sleep 1
  done
  die "postgres did not start"
}

q() { docker exec -i "$PG" psql -U rehearsal -d rehearsal -v ON_ERROR_STOP=1 -At -F $'\t' -c "$1"; }

write_env() {
  cat >"$WORK/api.env" <<ENV
POSTGRES_URL=$DB_URL
REDIS_URL=redis://$REDIS:6379/0
AUTH_ACCESS_TOKEN_SECRET=rehearsal-only-$(openssl rand -hex 16)
AUTH_ACCESS_TOKEN_LIFETIME=1d
AUTH_HASH_SALT=10
ENVIRONMENT=development
APP_URL=http://localhost
EMAIL_FROM=rehearsal@example.invalid
MAILGUN_API_KEY=rehearsal-no-mail
MAILGUN_DOMAIN=example.invalid
OPEN_AI_KEY=rehearsal-no-calls
OBJECT_STORAGE_ACCESS_KEY_ID=rehearsal
OBJECT_STORAGE_SECRET_ACCESS_KEY=rehearsal
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9
OBJECT_STORAGE_BUCKET=rehearsal
OBJECT_STORAGE_REGION=us-east-1
ENV
}

in_image() { docker run --rm --network "$NET" --env-file "$WORK/api.env" "$@"; }

start_api() {
  local name="$1"; shift
  docker run -d --name "$name" --network "$NET" --env-file "$WORK/api.env" "$@" >/dev/null
  for _ in $(seq 180); do
    docker exec "$name" curl -sf localhost:3000/health >/dev/null 2>&1 && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ] || return 1
    sleep 1
  done
  return 1
}

call() {
  local api="$1" method="$2" path="$3" body="${4:-}" token="${5:-}"
  local args=(-s -w '\n%{http_code}' -X "$method" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  docker exec "$api" curl "${args[@]}" "localhost:3000$path"
}
status_of() { tail -n1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

password_hash() {
  docker run --rm "$BRANCH_IMAGE" bun -e \
    "console.log(await Bun.password.hash('$PASSWORD', { algorithm: 'bcrypt', cost: 10 }))"
}

roster_sql="SELECT lower(email) FROM coach_leaders UNION SELECT lower(email) FROM coach_admins"

synthetic_dump() {
  [ -n "$OUT" ] || die "synthetic-dump needs --out <file>"
  main_image
  start_db
  write_env
  log "main's schema"
  in_image "$MAIN_IMAGE" bun run ./dist/migrator.js migrate-deploy >"$WORK/migrate-main.log" 2>&1 \
    || { cat "$WORK/migrate-main.log" >&2; die "main's migrations failed"; }
  local addresses
  addresses="$(python3 - "$REPO/packages/backend-base/src/coach/coach.data.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
emails = [c["email"] for c in d["coaches"] if not c["email"].endswith(".invalid")]
print("\n".join(emails[:4] + d.get("admins", [])[:1]))
PY
)"
  local l1 l2 l3 l4 admin
  { read -r l1; read -r l2; read -r l3; read -r l4; read -r admin; } <<<"$addresses"
  log "synthetic accounts"
  q "
    INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\", password)
    SELECT 'member-' || n || '@example.test', 'Member', n::text, n % 3 <> 0, 'synthetic'
    FROM generate_series(1, 200) n;
    INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\", password) VALUES
      ('$l1', 'Password', 'Leader', true, 'synthetic'),
      ('$l2', 'Google', 'Leader', true, NULL),
      ('$l3', 'Renamed', 'Leader', true, NULL),
      ('$l4', 'Unconfirmed', 'Leader', false, 'synthetic'),
      ('$admin', 'Program', 'Admin', true, 'synthetic'),
      ('portal-added@example.test', 'Portal', 'Added', true, 'synthetic');
    INSERT INTO user_sso_accounts (user_id, provider, provider_user_id, email)
      SELECT id, 'google', 'synthetic-' || id, lower(email) FROM \"user\" WHERE email = '$l2';
    INSERT INTO user_sso_accounts (user_id, provider, provider_user_id, email)
      SELECT id, 'google', 'synthetic-' || id, 'someone-else@example.test' FROM \"user\" WHERE email = '$l3';
    INSERT INTO coach_leaders (email, name) VALUES ('portal-added@example.test', 'Portal Added');
  " >/dev/null
  docker exec "$PG" pg_dump -U rehearsal -d rehearsal -Fc -f /tmp/synthetic.dump
  docker cp "$PG:/tmp/synthetic.dump" "$OUT"
  echo "synthetic dump: $OUT (main's schema, $(q 'SELECT count(*) FROM "user"') accounts)"
}

run() {
  [ -f "$DUMP" ] || die "--dump <file> is required and must exist"
  OUT="${OUT:-$(mktemp -d)/coach-rehearsal}"
  mkdir -p "$OUT"
  branch_image
  main_image
  start_db
  write_env

  log "restoring $DUMP"
  docker cp "$DUMP" "$PG:/tmp/dump"
  if docker exec "$PG" pg_restore -l /tmp/dump >/dev/null 2>&1; then
    docker exec "$PG" pg_restore -U rehearsal -d rehearsal --no-owner --no-privileges /tmp/dump \
      >"$OUT/restore.log" 2>&1 || true
  else
    docker exec "$PG" psql -U rehearsal -d rehearsal -q -f /tmp/dump >"$OUT/restore.log" 2>&1 || true
  fi
  q 'SELECT 1 FROM "user" LIMIT 1' >/dev/null || die "the dump has no user table (restore.log)"

  log "before"
  q "SELECT name FROM kysely_migration ORDER BY name" >"$OUT/migrations-before.txt"
  q "SELECT id, lower(email), \"emailVerified\" FROM \"user\" ORDER BY id" >"$WORK/users-before.tsv"
  local last_applied first_new
  last_applied="$(tail -n1 "$OUT/migrations-before.txt")"
  first_new="$(ls "$REPO/packages/database/migrations" | sed 's/\.ts$//' | sort \
    | comm -23 - "$OUT/migrations-before.txt" | head -n1)"
  local order_ok=yes
  [[ -n "$first_new" && "$first_new" < "$last_applied" ]] && order_ok=no

  log "branch: migrations"
  local t0 migrate_secs deploy_secs
  t0="$(now)"
  in_image "$BRANCH_IMAGE" bun run ./dist/migrator.js migrate-deploy >"$OUT/migrate.log" 2>&1 \
    || { tail -n 20 "$OUT/migrate.log" >&2; die "the branch's migrations failed (migrate.log)"; }
  migrate_secs="$(since "$t0")"
  log "branch: deploy backfill"
  t0="$(now)"
  in_image "$BRANCH_IMAGE" bun --bun run ./dist/coach-deploy.js >"$OUT/coach-deploy.log" 2>&1
  deploy_secs="$(since "$t0")"
  log "branch: API with the image's own start sequence"
  start_api "$API" "$BRANCH_IMAGE" || { docker logs "$API" >"$OUT/api.log" 2>&1; die "the branch API did not start (api.log)"; }
  docker logs "$API" >"$OUT/api-start.log" 2>&1

  log "after"
  q "SELECT name FROM kysely_migration ORDER BY name" >"$OUT/migrations-after.txt"
  q "SELECT id, lower(email), \"emailVerified\" FROM \"user\" ORDER BY id" >"$WORK/users-after.tsv"
  join -t $'\t' "$WORK/users-before.tsv" "$WORK/users-after.tsv" \
    | awk -F'\t' '$3 != $5 { print $2 "\t" $3 " -> " $5 }' >"$OUT/confirmation-changes.tsv"
  local cleared applied leaders admins legacy kept_unstamped
  cleared="$(wc -l <"$OUT/confirmation-changes.tsv" | tr -d ' ')"
  applied="$(comm -13 "$OUT/migrations-before.txt" "$OUT/migrations-after.txt" | wc -l | tr -d ' ')"
  leaders="$(q "SELECT count(*) FROM coach_leaders WHERE slug IS NOT NULL")"
  admins="$(q "SELECT count(*) FROM coach_admins")"
  legacy="$(q "SELECT count(*) FROM coach_reports WHERE source_session_id LIKE 'legacy:%'")"
  kept_unstamped="$(q "SELECT count(*) FROM \"user\" WHERE lower(email) IN ($roster_sql)
    AND \"emailVerified\" AND email_verified_at IS NULL")"

  log "a leader signs in, is asked to confirm, confirms, and reaches the portal"
  local hash leader member r token key
  hash="$(password_hash)"
  leader="$(q "SELECT lower(email) FROM coach_leaders WHERE slug IS NOT NULL
    AND email NOT LIKE '%.invalid' ORDER BY slug LIMIT 1")"
  [ -n "$leader" ] || die "no leader in the roster after the deploy backfill"
  local leader_account="its existing account, password set for the rehearsal"
  if [ "$(q "SELECT count(*) FROM \"user\" WHERE lower(email) = '$leader'")" = 0 ]; then
    leader_account="a new unconfirmed account made for the rehearsal"
    q "INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\")
       VALUES ('$leader', 'Rehearsal', 'Leader', false)" >/dev/null
  fi
  q "UPDATE \"user\" SET password = '$hash' WHERE lower(email) = '$leader'" >/dev/null
  r="$(call "$API" POST /auth/login "{\"email\":\"$leader\",\"password\":\"$PASSWORD\"}")"
  local leader_login leader_gate leader_send leader_verify leader_after leader_slug
  leader_login="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")')"
  r="$(call "$API" GET /coach/me "" "$token")"
  leader_gate="$(status_of "$r") $(body_of "$r" | json 'd.get("details",{}).get("refusal","")' 2>/dev/null || true)"
  leader_send="$(status_of "$(call "$API" POST /auth/send-email-verification "" "$token")")"
  key="$(docker exec "$REDIS" valkey-cli --scan --pattern 'verifyEmail:*' | head -n1 | sed 's/^verifyEmail://')"
  r="$(call "$API" POST /auth/verify-email "{\"token\":\"$key\"}" "$token")"
  leader_verify="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")' 2>/dev/null || echo "$token")"
  r="$(call "$API" GET /coach/me "" "$token")"
  leader_after="$(status_of "$r")"
  leader_slug="$(body_of "$r" | json '"isCoach=%s, profile %s" % (d.get("isCoach"), (d.get("profile") or {}).get("id", ""))' 2>/dev/null || true)"

  log "a normal account signs in to the app"
  member="$(q "SELECT lower(email) FROM \"user\" WHERE lower(email) NOT IN ($roster_sql)
    ORDER BY \"createdAt\" LIMIT 1")"
  q "UPDATE \"user\" SET password = '$hash' WHERE lower(email) = '$member'" >/dev/null
  r="$(call "$API" POST /auth/login "{\"email\":\"$member\",\"password\":\"$PASSWORD\"}")"
  local member_login member_me
  member_login="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")')"
  member_me="$(status_of "$(call "$API" GET /user/me "" "$token")")"

  log "rollback to main's image"
  docker logs "$API" >"$OUT/api.log" 2>&1
  docker rm -f "$API" >/dev/null
  local main_cmd main_cmd_note main_api main_login main_coach
  if timeout 180 docker run --rm --network "$NET" --env-file "$WORK/api.env" "$MAIN_IMAGE" \
      >"$OUT/rollback-main-cmd.log" 2>&1; then main_cmd="exited 0"; else main_cmd="exited non-zero"; fi
  main_cmd_note="$(grep -m1 -o 'corrupted migrations[^"]*' "$OUT/rollback-main-cmd.log" || true)"
  if start_api "$API-main" "$MAIN_IMAGE" bun --bun run ./dist/index.js; then
    main_api="healthy"
    r="$(call "$API-main" POST /auth/login "{\"email\":\"$member\",\"password\":\"$PASSWORD\"}")"
    main_login="$(status_of "$r")"
    r="$(call "$API-main" POST /auth/login "{\"email\":\"$leader\",\"password\":\"$PASSWORD\"}")"
    token="$(body_of "$r" | json 'd.get("accessToken","")' 2>/dev/null || true)"
    main_coach="$(status_of "$(call "$API-main" GET /coach/me "" "$token")")"
  else
    main_api="did not start"; main_login="-"; main_coach="-"
  fi
  docker logs "$API-main" >"$OUT/rollback-api.log" 2>&1 || true

  cat >"$OUT/report.md" <<REPORT
# Coach deploy rehearsal

- Dump: \`$(basename "$DUMP")\`, restored into $PG_IMAGE ($(grep -c -i error "$OUT/restore.log" || true) restore error lines, restore.log)
- Branch image: \`$BRANCH_IMAGE\`; main image: \`$MAIN_IMAGE\`
- Every container ran on an internal Docker network with no route out, and the mail and model keys were dummies, so nothing was sent anywhere

## Migrations

- Last applied before: \`$last_applied\`; first new: \`${first_new:-none}\`; order accepted by the migrator: $order_ok
- Applied by the branch: $applied, in ${migrate_secs}s (migrate.log)
- Deploy backfill: ${deploy_secs}s (coach-deploy.log):
$(sed 's/^/  - /' "$OUT/coach-deploy.log")

## Results

- Roster leaders: $leaders; admins: $admins; legacy reports: $legacy
- Accounts whose confirmation changed: $cleared (confirmation-changes.tsv)
- Accounts on roster or admin addresses that kept a confirmation without the new stamp (bind on their next Google/Apple sign-in or the link): $kept_unstamped
- Second start (the image's own CMD: migrator, deploy backfill, API): $(grep -c 'coach-deploy' "$OUT/api-start.log" || true) deploy lines, healthy

## Flows on the branch

- Leader sign-in: $leader_login; coaching page before confirming: $leader_gate
- Confirmation email request: $leader_send; confirming with the link's token: $leader_verify
- Coaching page after confirming: $leader_after ($leader_slug)
- The leader used: $leader_account
- Normal account sign-in: $member_login; \`/user/me\`: $member_me

## Rollback to main's image

- Main's image with its own CMD (migrator first): $main_cmd ${main_cmd_note:+(\`$main_cmd_note\`)}
- Main's image with the run command \`bun --bun run ./dist/index.js\`: $main_api; normal sign-in: $main_login; leader \`/coach/me\`: $main_coach
REPORT
  cat "$OUT/report.md"
  echo
  echo "evidence: $OUT"
}

case "$COMMAND" in
  run) run ;;
  synthetic-dump) synthetic_dump ;;
  *) usage >&2; exit 2 ;;
esac
