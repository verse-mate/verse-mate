#!/usr/bin/env bash
set -euo pipefail
umask 077
export LC_ALL=C

usage() {
  cat <<'USAGE'
Rehearse the coach deploy on a copy of a database, offline.

  scripts/coach-deploy-rehearsal.sh run --dump <file> [options]
      Restore the dump into a throwaway Postgres on an internal Docker network
      (no route out, data kept in memory only), run this branch's image start
      sequence against it, check the results, then roll back to main's image.
      Writes report.md and the evidence files to --out, and exits non-zero
      when a check fails.

  scripts/coach-deploy-rehearsal.sh synthetic-dump --out <file> [options]
      Build a database from main's schema with synthetic accounts that exercise
      every confirmation case, and dump it (pg_dump -Fc). A run on it also
      checks each case's expected outcome.

Options:
  --out <path>             run: output directory (default: a new temp dir)
  --branch-image <tag>     image of this branch (default: built from this checkout)
  --main-image <tag>       image of main (default: built from origin/main)
  --postgres-image <tag>   default postgres:15.4-alpine; match production's major
                           version, pg_restore refuses a dump from a newer one
  --keep                   leave the containers running for inspection; they
                           hold the dump's data until removed

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
FAILED=()

log() { printf '\n== %s\n' "$*" >&2; }
die() { echo "FAILED: $*" >&2; exit 1; }
check() {
  if [ "$2" = "$3" ]; then echo "- [x] $1"; else
    echo "- [ ] $1: expected \`$3\`, got \`$2\`"; FAILED+=("$1"); fi
}
now() { python3 -c 'import time; print(time.time())'; }
since() { python3 -c "import sys, time; print(f'{time.time() - float(sys.argv[1]):.1f}')" "$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null || true; }
jbody() { python3 -c 'import json,sys; a=sys.argv[1:]; print(json.dumps(dict(zip(a[::2], a[1::2]))))' "$@"; }

cleanup() {
  if [ "$KEEP" = 1 ]; then
    echo "kept: containers $PG $REDIS ${API}*, network $NET (they hold the dump's data)" >&2
  else
    docker rm -f -v "$API" "$API-2" "$API-main" "$PG" "$REDIS" >/dev/null 2>&1 || true
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
  docker run -d --name "$PG" --network "$NET" --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=rehearsal -e POSTGRES_PASSWORD=rehearsal \
    -e POSTGRES_DB=rehearsal "$PG_IMAGE" >/dev/null
  docker run -d --name "$REDIS" --network "$NET" --tmpfs /data valkey/valkey:8-alpine >/dev/null
  for _ in $(seq 60); do
    docker exec "$PG" pg_isready -U rehearsal -d rehearsal >/dev/null 2>&1 && return
    sleep 1
  done
  die "postgres did not start"
}

q() {
  local statement="$1"; shift
  docker exec -i "$PG" psql -U rehearsal -d rehearsal -v ON_ERROR_STOP=1 -At -F $'\t' "$@" <<<"$statement"
}

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

launch_api() {
  local name="$1"; shift
  docker run -d --name "$name" --network "$NET" --env-file "$WORK/api.env" "$@" >/dev/null
}

wait_healthy() {
  local name="$1"
  for _ in $(seq 240); do
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
  docker exec "$api" curl "${args[@]}" "localhost:3000$path" || printf '\n000'
}
status_of() { tail -n1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }

login() {
  call "$1" POST /auth/login "$(jbody email "$2" password "$PASSWORD")"
}

password_hash() {
  docker run --rm --network none "$BRANCH_IMAGE" bun -e \
    "console.log(await Bun.password.hash('$PASSWORD', { algorithm: 'bcrypt', cost: 10 }))"
}

roster_sql="SELECT lower(trim(email)) FROM coach_leaders UNION SELECT lower(trim(email)) FROM coach_admins"
store_digest="SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), ''))
  FROM (SELECT r::text FROM coach_reports r UNION ALL SELECT l::text FROM coach_leaders l
        UNION ALL SELECT a::text FROM coach_admins a
        UNION ALL SELECT s::text FROM coach_monthly_leader_summaries s
        UNION ALL SELECT n::text FROM coach_monthly_narratives n
        UNION ALL SELECT m::text FROM coach_dataset_meta m) t(t)"

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
print("\n".join(emails[:6] + d.get("admins", [])[:1]))
PY
)"
  local l1 l2 l3 l4 l5 l6 admin
  { read -r l1; read -r l2; read -r l3; read -r l4; read -r l5; read -r l6; read -r admin; } <<<"$addresses"
  log "synthetic accounts"
  q "
    INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\", password)
    SELECT 'member-' || n || '@example.test', 'Member', n::text, n % 3 <> 0, 'synthetic'
    FROM generate_series(1, 200) n;
    INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\", password) VALUES
      (:'l1', 'Password', 'Leader', true, 'synthetic'),
      (:'l2', 'Google', 'Leader', true, NULL),
      (:'l3', 'Renamed', 'Leader', true, NULL),
      (:'l4', 'Unconfirmed', 'Leader', false, 'synthetic'),
      (:'l5', 'Mixed', 'Leader', true, NULL),
      (upper(:'l6'), 'Upper', 'Leader', true, 'synthetic'),
      (:'admin', 'Program', 'Admin', true, 'synthetic'),
      ('portal-added@example.test', 'Portal', 'Added', true, 'synthetic');
    INSERT INTO user_sso_accounts (user_id, provider, provider_user_id, email)
      SELECT id, 'google', 'synthetic-g-' || id, lower(email) FROM \"user\"
      WHERE \"firstName\" IN ('Google', 'Mixed') AND \"lastName\" = 'Leader';
    INSERT INTO user_sso_accounts (user_id, provider, provider_user_id, email)
      SELECT id, 'apple', 'synthetic-a-' || id, 'someone-else@example.test' FROM \"user\"
      WHERE \"firstName\" IN ('Renamed', 'Mixed') AND \"lastName\" = 'Leader';
    INSERT INTO coach_leaders (email, name) VALUES ('portal-added@example.test', 'Portal Added');
  " -v l1="$l1" -v l2="$l2" -v l3="$l3" -v l4="$l4" -v l5="$l5" -v l6="$l6" -v admin="$admin" >/dev/null
  docker exec "$PG" pg_dump -U rehearsal -d rehearsal -Fc -f /tmp/synthetic.dump
  docker cp "$PG:/tmp/synthetic.dump" "$OUT"
  echo "synthetic dump: $OUT (main's schema, $(q 'SELECT count(*) FROM "user"') accounts)"
}

synthetic_checks() {
  [ "$(q "SELECT count(*) FROM \"user\" WHERE email = 'portal-added@example.test'")" = 1 ] || return 0
  echo
  echo "## The synthetic cases"
  echo
  local who
  for who in "Password:f" "Google:t" "Renamed:f" "Unconfirmed:f" "Mixed:f" "Upper:f"; do
    check "${who%%:*} leader's confirmation after the deploy" \
      "$(q "SELECT \"emailVerified\" FROM \"user\" WHERE \"firstName\" = '${who%%:*}' AND \"lastName\" = 'Leader'")" "${who##*:}"
  done
  check "Program admin's confirmation after the deploy" \
    "$(q "SELECT \"emailVerified\" FROM \"user\" WHERE \"firstName\" = 'Program'")" f
  check "the portal-added leader (on the roster before the migrations) is cleared by the migration's sweep" \
    "$(q "SELECT \"emailVerified\" FROM \"user\" WHERE email = 'portal-added@example.test'")" f
  check "links made for another address are removed from cleared accounts" \
    "$(q "SELECT count(*) FROM user_sso_accounts WHERE email = 'someone-else@example.test'")" 0
  check "the Mixed leader keeps its link for its own address" \
    "$(q "SELECT count(*) FROM user_sso_accounts s JOIN \"user\" u ON u.id = s.user_id WHERE u.\"firstName\" = 'Mixed'")" 1
  check "no member's confirmation changed" \
    "$(q "SELECT count(*) FROM \"user\" WHERE \"firstName\" = 'Member' AND \"emailVerified\" <> (\"lastName\"::int % 3 <> 0)")" 0
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
  if [ "$(head -c 5 "$DUMP")" = "PGDMP" ]; then
    docker exec -i "$PG" pg_restore -U rehearsal -d rehearsal --no-owner --no-privileges \
      <"$DUMP" >"$OUT/restore.log" 2>&1 || true
  else
    docker exec -i "$PG" psql -U rehearsal -d rehearsal -q -f - <"$DUMP" >"$OUT/restore.log" 2>&1 || true
  fi
  q 'SELECT 1 FROM "user" LIMIT 1' >/dev/null || die "the dump has no user table (restore.log)"

  log "before"
  q "SELECT name FROM kysely_migration ORDER BY name" >"$OUT/migrations-before.txt"
  q "SELECT id, lower(email), \"emailVerified\" FROM \"user\" ORDER BY id::text" >"$WORK/users-before.tsv"
  local last_applied first_new order_ok=yes
  last_applied="$(tail -n1 "$OUT/migrations-before.txt")"
  first_new="$(ls "$REPO/packages/database/migrations" | sed 's/\.ts$//' | sort \
    | comm -23 - "$OUT/migrations-before.txt" | head -n1)"
  [[ -n "$first_new" && "$first_new" < "$last_applied" ]] && order_ok=no

  log "branch: migrations"
  local t0 migrate_secs deploy_secs migrate_ok=yes
  t0="$(now)"
  in_image "$BRANCH_IMAGE" bun run ./dist/migrator.js migrate-deploy >"$OUT/migrate.log" 2>&1 || migrate_ok=no
  migrate_secs="$(since "$t0")"
  [ "$migrate_ok" = yes ] || { tail -n 20 "$OUT/migrate.log" >&2; die "the branch's migrations failed (migrate.log)"; }
  log "branch: deploy backfill"
  t0="$(now)"
  in_image "$BRANCH_IMAGE" timeout 300 bun --bun run ./dist/coach-deploy.js >"$OUT/coach-deploy.log" 2>&1 || true
  deploy_secs="$(since "$t0")"
  local digest_first digest_second
  digest_first="$(q "$store_digest")"

  log "branch: two API containers starting together with the image's own CMD"
  launch_api "$API" "$BRANCH_IMAGE"
  launch_api "$API-2" "$BRANCH_IMAGE"
  local api_ok=yes api2_ok=yes
  wait_healthy "$API" || api_ok=no
  wait_healthy "$API-2" || api2_ok=no
  docker logs "$API" >"$OUT/api-start.log" 2>&1
  docker logs "$API-2" >"$OUT/api-2-start.log" 2>&1
  [ "$api_ok" = yes ] || die "the branch API did not start (api-start.log)"
  docker rm -f -v "$API-2" >/dev/null
  digest_second="$(q "$store_digest")"

  log "after"
  q "SELECT name FROM kysely_migration ORDER BY name" >"$OUT/migrations-after.txt"
  q "SELECT id, lower(email), \"emailVerified\" FROM \"user\" ORDER BY id::text" >"$WORK/users-after.tsv"
  join -t $'\t' "$WORK/users-before.tsv" "$WORK/users-after.tsv" \
    | awk -F'\t' '$3 != $5 { print $2 "\t" $3 " -> " $5 }' >"$OUT/confirmation-changes.tsv"
  local changed applied leaders admins legacy kept_unstamped off_roster turned_on
  changed="$(wc -l <"$OUT/confirmation-changes.tsv" | tr -d ' ')"
  applied="$(comm -13 "$OUT/migrations-before.txt" "$OUT/migrations-after.txt" | wc -l | tr -d ' ')"
  leaders="$(q "SELECT count(*) FROM coach_leaders WHERE slug IS NOT NULL")"
  admins="$(q "SELECT count(*) FROM coach_admins")"
  legacy="$(q "SELECT count(*) FROM coach_reports WHERE source_session_id LIKE 'legacy:%'")"
  kept_unstamped="$(q "SELECT count(*) FROM \"user\" WHERE lower(trim(email)) IN ($roster_sql)
    AND \"emailVerified\" AND email_verified_at IS NULL")"
  cut -f1 "$OUT/confirmation-changes.tsv" | sort -u >"$WORK/changed-addresses.txt"
  q "$roster_sql" | sort -u >"$WORK/roster.txt"
  off_roster="$(comm -23 "$WORK/changed-addresses.txt" "$WORK/roster.txt" | wc -l | tr -d ' ')"
  turned_on="$(grep -c 'f -> t' "$OUT/confirmation-changes.tsv" || true)"
  local turned_off recorded unrecorded
  join -t $'\t' "$WORK/users-before.tsv" "$WORK/users-after.tsv" \
    | awk -F'\t' '$3 == "t" && $5 == "f" { print $1 }' | sort >"$WORK/cleared-ids.txt"
  turned_off="$(wc -l <"$WORK/cleared-ids.txt" | tr -d ' ')"
  q "SELECT source, lower(trim(email)), jsonb_array_length(removed_links) FROM coach_confirmation_clears
    ORDER BY 2, 1" >"$OUT/confirmation-clears.tsv"
  q "SELECT DISTINCT user_id FROM coach_confirmation_clears" | sort >"$WORK/recorded-ids.txt"
  recorded="$(wc -l <"$WORK/recorded-ids.txt" | tr -d ' ')"
  unrecorded="$(comm -3 "$WORK/cleared-ids.txt" "$WORK/recorded-ids.txt" | wc -l | tr -d ' ')"

  log "the sweep rolled back, then applied again"
  local links_before removed_links links_restored still_cleared records_left recleared
  links_before="$(q "SELECT count(*) FROM user_sso_accounts")"
  removed_links="$(q "SELECT coalesce(sum(jsonb_array_length(removed_links)), 0) FROM coach_confirmation_clears")"
  in_image -e COACH_ROLLBACK_RESTORE_CONFIRMATIONS=1 "$BRANCH_IMAGE" bun run ./dist/migrator.js migrate-down \
    >"$OUT/sweep-down.log" 2>&1 || { cat "$OUT/sweep-down.log" >&2; die "the sweep's down failed (sweep-down.log)"; }
  links_restored="$(( $(q "SELECT count(*) FROM user_sso_accounts") - links_before ))"
  still_cleared="$(q "SELECT id FROM \"user\" WHERE NOT \"emailVerified\"" | sort | comm -12 - "$WORK/cleared-ids.txt" | wc -l | tr -d ' ')"
  records_left="$(q "SELECT count(*) FROM coach_confirmation_clears")"
  in_image "$BRANCH_IMAGE" bun run ./dist/migrator.js migrate-deploy >"$OUT/sweep-up.log" 2>&1 \
    || { cat "$OUT/sweep-up.log" >&2; die "the sweep did not apply again (sweep-up.log)"; }
  recleared="$(q "SELECT DISTINCT user_id FROM coach_confirmation_clears" | sort | comm -3 - "$WORK/cleared-ids.txt" | wc -l | tr -d ' ')"

  log "a leader signs in, is asked to confirm, confirms, and reaches the portal"
  local hash leader member r token key leader_account="its existing account, password set for the rehearsal"
  hash="$(password_hash)"
  leader="$(q "SELECT lower(email) FROM coach_leaders WHERE slug IS NOT NULL
    AND email NOT LIKE '%.invalid' ORDER BY slug LIMIT 1")"
  [ -n "$leader" ] || die "no leader in the roster after the deploy backfill"
  if [ "$(q "SELECT count(*) FROM \"user\" WHERE lower(trim(email)) = :'leader'" -v leader="$leader")" = 0 ]; then
    leader_account="a new unconfirmed account made for the rehearsal"
    q "INSERT INTO \"user\" (email, \"firstName\", \"lastName\", \"emailVerified\")
       VALUES (:'leader', 'Rehearsal', 'Leader', false)" -v leader="$leader" >/dev/null
  fi
  q "UPDATE \"user\" SET password = :'hash' WHERE lower(trim(email)) = :'leader'" \
    -v hash="$hash" -v leader="$leader" >/dev/null
  r="$(login "$API" "$leader")"
  local leader_login leader_gate leader_send leader_verify leader_after leader_me
  leader_login="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")')"
  r="$(call "$API" GET /coach/me "" "$token")"
  leader_gate="$(status_of "$r") $(body_of "$r" | json 'd.get("details",{}).get("refusal","")')"
  leader_send="$(status_of "$(call "$API" POST /auth/send-email-verification "" "$token")")"
  key="$(docker exec "$REDIS" valkey-cli --scan --pattern 'verifyEmail:*' | head -n1 | sed 's/^verifyEmail://')"
  r="$(call "$API" POST /auth/verify-email "$(jbody token "$key")" "$token")"
  leader_verify="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")')"
  r="$(call "$API" GET /coach/me "" "$token")"
  leader_after="$(status_of "$r")"
  leader_me="$(body_of "$r" | json 'd.get("isCoach")')"

  log "a normal account signs in to the app"
  member="$(q "SELECT lower(email) FROM \"user\" WHERE lower(trim(email)) NOT IN ($roster_sql)
    ORDER BY \"createdAt\" LIMIT 1")"
  q "UPDATE \"user\" SET password = :'hash' WHERE lower(email) = :'member'" \
    -v hash="$hash" -v member="$member" >/dev/null
  r="$(login "$API" "$member")"
  local member_login member_me
  member_login="$(status_of "$r")"
  token="$(body_of "$r" | json 'd.get("accessToken","")')"
  member_me="$(status_of "$(call "$API" GET /user/me "" "$token")")"

  log "rollback to main's image"
  docker logs "$API" >"$OUT/api.log" 2>&1
  docker rm -f -v "$API" >/dev/null
  local main_cmd=started main_cmd_note main_api=healthy main_login=- main_coach=-
  if timeout 180 docker run --rm --network "$NET" --env-file "$WORK/api.env" "$MAIN_IMAGE" \
      >"$OUT/rollback-main-cmd.log" 2>&1; then main_cmd="exited 0"; else main_cmd="exited non-zero"; fi
  main_cmd_note="$(grep -m1 -o 'corrupted migrations[^"]*' "$OUT/rollback-main-cmd.log" || true)"
  launch_api "$API-main" "$MAIN_IMAGE" bun --bun run ./dist/index.js
  if wait_healthy "$API-main"; then
    main_login="$(status_of "$(login "$API-main" "$member")")"
    r="$(login "$API-main" "$leader")"
    token="$(body_of "$r" | json 'd.get("accessToken","")')"
    main_coach="$(status_of "$(call "$API-main" GET /coach/me "" "$token")")"
  else
    main_api="did not start"
  fi
  docker logs "$API-main" >"$OUT/rollback-api.log" 2>&1 || true

  {
    echo "# Coach deploy rehearsal"
    echo
    echo "- Dump: \`$(basename "$DUMP")\`, restored into $PG_IMAGE ($(grep -c -i error "$OUT/restore.log" || true) restore error lines, restore.log)"
    echo "- Branch image: \`$BRANCH_IMAGE\`; main image: \`$MAIN_IMAGE\`"
    echo "- Every container ran on an internal Docker network with no route out, the dump streamed into databases held in memory, and dummy mail and model keys: nothing was sent anywhere"
    echo
    echo "## Migrations and the deploy backfill"
    echo
    echo "- Last applied before: \`$last_applied\`; first new: \`${first_new:-none}\`"
    echo "- Applied by the branch: $applied, in ${migrate_secs}s (migrate.log)"
    echo "- Deploy backfill: ${deploy_secs}s (coach-deploy.log):"
    sed 's/^/  - /' "$OUT/coach-deploy.log"
    echo "- Roster leaders: $leaders; admins: $admins; legacy reports: $legacy"
    echo "- Accounts whose confirmation changed: $changed (confirmation-changes.tsv)"
    echo "- Recorded clears (the sweep's and the roster triggers'): $(wc -l <"$OUT/confirmation-clears.tsv" | tr -d ' ') for $recorded account(s), against $turned_off confirmation(s) turned off (confirmation-clears.tsv: source, address, provider links removed)"
    echo "- The sweep rolled back with COACH_ROLLBACK_RESTORE_CONFIRMATIONS=1 (sweep-down.log), then applied again (sweep-up.log)"
    echo "- Accounts on roster or admin addresses that kept a confirmation without the new stamp (bind on their next Google or Apple sign-in, or the link): $kept_unstamped"
    echo
    echo "## Flows"
    echo
    echo "- The leader used: $leader_account"
    echo "- Main's image with its own CMD after the branch migrated: $main_cmd ${main_cmd_note:+(\`$main_cmd_note\`)}"
    echo
    echo "## Checks"
    echo
    check "the dump restored without errors" "$(grep -c -i error "$OUT/restore.log" || true)" 0
    check "the migrator accepts the new migrations' order" "$order_ok" yes
    check "the deploy backfill logged no failure" "$(grep -c 'failed\|skipped' "$OUT/coach-deploy.log" || true)" 0
    check "only roster or admin addresses changed confirmation" "$off_roster" 0
    check "no confirmation was turned on" "$turned_on" 0
    check "every cleared confirmation is recorded, and nothing else" "$unrecorded" 0
    check "the sweep's down confirms every cleared account again" "$still_cleared" 0
    check "the sweep's down restores every removed link" "$links_restored" "$removed_links"
    check "the sweep's down leaves no record" "$records_left" 0
    check "the sweep applied again clears the same accounts" "$recleared" 0
    check "two containers started together, both healthy" "$api_ok $api2_ok" "yes yes"
    check "starting again with the same bundle changed no coach row" "$digest_second" "$digest_first"
    check "leader sign-in" "$leader_login" 200
    check "the coaching page asks the leader to confirm" "$leader_gate" "403 confirm-email"
    check "the confirmation email is sent" "$leader_send" 204
    check "the link's token confirms" "$leader_verify" 200
    check "the coaching page opens for the leader" "$leader_after $leader_me" "200 True"
    check "normal account sign-in and /user/me" "$member_login $member_me" "200 200"
    check "main's image started without its migrator" "$main_api" healthy
    check "normal sign-in on main's image" "$main_login" 200
    check "the leader's coaching page on main's image" "$main_coach" 200
    synthetic_checks
  } >"$OUT/report.md"
  cat "$OUT/report.md"
  echo
  echo "evidence: $OUT"
  [ "${#FAILED[@]}" -eq 0 ] || die "${#FAILED[@]} check(s) failed"
}

case "$COMMAND" in
  run) run ;;
  synthetic-dump) synthetic_dump ;;
  *) usage >&2; exit 2 ;;
esac
