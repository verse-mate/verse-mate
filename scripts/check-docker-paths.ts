#!/usr/bin/env bun
/**
 * Pre-flight: verify Docker containers (postgres, redis, minio) are bound to
 * the current repo path. On macOS, containers started from a prior workspace
 * stay alive after a clone/move and silently shadow `docker compose up -d`,
 * leading to Postgres data corruption.
 *
 * Exits non-zero with a remediation hint if any tracked container is bound to
 * a different path. See repos/versemate-meta/CLAUDE.md → "Stale container
 * cleanup (macOS bind-mount trap)".
 *
 * Usage:  bun scripts/check-docker-paths.ts
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const CONTAINERS = ["postgres", "redis", "minio"];

type MountInspect = { Source: string; Destination: string; Type: string };

function inspectMounts(name: string): MountInspect[] | null {
  try {
    const raw = execSync(
      `docker inspect --format '{{json .Mounts}}' ${name} 2>/dev/null`,
      { encoding: "utf8" },
    ).trim();
    if (!raw) return null;
    return JSON.parse(raw) as MountInspect[];
  } catch {
    return null;
  }
}

const repoPath = resolve(import.meta.dir, "..");
let mismatch = false;
const lines: string[] = [];

for (const name of CONTAINERS) {
  const mounts = inspectMounts(name);
  if (!mounts) {
    lines.push(`  ${name}: not running (ok)`);
    continue;
  }
  const bindMounts = mounts.filter((m) => m.Type === "bind");
  const stale = bindMounts.find((m) => !m.Source.startsWith(repoPath));
  if (stale) {
    mismatch = true;
    lines.push(
      `  ${name}: STALE — bound to ${stale.Source} (expected under ${repoPath})`,
    );
  } else {
    lines.push(`  ${name}: ok`);
  }
}

console.log(`Repo path: ${repoPath}`);
console.log("Containers:");
for (const line of lines) console.log(line);

if (mismatch) {
  console.error(
    "\nStale containers detected. Run:\n" +
      "  docker rm -f postgres redis minio prisma-studio minio-setup\n" +
      "  docker compose up -d\n" +
      "See repos/versemate-meta/CLAUDE.md → 'Stale container cleanup'.",
  );
  process.exit(1);
}
