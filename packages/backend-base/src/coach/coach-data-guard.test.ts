import { afterAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COACH_DIR = new URL(".", import.meta.url).pathname;
const SRC_DIR = join(COACH_DIR, "..");
const BACKEND_DOCKERFILE = join(SRC_DIR, "../../../apps/backend/Dockerfile");
const DATABASE_MIGRATIONS = join(SRC_DIR, "../../database/migrations");
const DATABASE_SEEDS = join(SRC_DIR, "../../database/src/seeds");
const DATASET = "coach.data.json";
const ADDRESS = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const ALLOWED_DOMAINS = ["example.org", "example.com", "fireflies.ai"];
const ALLOWED_SUFFIXES = [".test", ".invalid", ".local"];

function allowedDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.+$/, "");
  if (d === "versemate.org" || d.endsWith(".versemate.org")) return true;
  if (ALLOWED_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`))) return true;
  return ALLOWED_SUFFIXES.some((s) => d === s.slice(1) || d.endsWith(s));
}

function coachDataViolations(dir: string): string[] {
  const found: string[] = [];
  if (existsSync(join(dir, DATASET)))
    found.push(`${DATASET} is committed again`);
  for (const file of new Bun.Glob("**/*.{ts,tsx,js,json,md}").scanSync(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const [address, domain] of text.matchAll(ADDRESS))
      if (!allowedDomain(domain)) found.push(`${file}: ${address}`);
  }
  return found;
}

const scratch: string[] = [];
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "coach-guard-"));
  scratch.push(dir);
  return dir;
}

describe("the coaching dataset stays out of the repository", () => {
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  it("the coach module holds no dataset and no real address", () => {
    expect(coachDataViolations(COACH_DIR)).toEqual([]);
  });

  it("no copy of the dataset sits anywhere in the backend source", () => {
    expect([...new Bun.Glob(`**/${DATASET}`).scanSync(SRC_DIR)]).toEqual([]);
  });

  it("no migration or seed puts a leader, an admin or a report into a fresh database", () => {
    const writes =
      /insertInto\(\s*["']coach_(leaders|admins|reports)["']|INSERT\s+INTO\s+"?coach_(leaders|admins|reports)\b/i;
    const found: string[] = [];
    for (const dir of [DATABASE_MIGRATIONS, DATABASE_SEEDS])
      for (const file of new Bun.Glob("**/*.ts").scanSync(dir))
        if (writes.test(readFileSync(join(dir, file), "utf8")))
          found.push(file);
    expect(found).toEqual([]);
  });

  it("the backend image starts without loading a coaching dataset", () => {
    const dockerfile = readFileSync(BACKEND_DOCKERFILE, "utf8");
    const start = dockerfile.slice(dockerfile.lastIndexOf("\nCMD "));
    expect(start).not.toMatch(/coach/i);
  });

  it("names the file when the dataset comes back", () => {
    const dir = scratchDir();
    writeFileSync(join(dir, DATASET), "{}");
    expect(coachDataViolations(dir)).toEqual([`${DATASET} is committed again`]);
  });

  it("names the file and the address for a real address in a fixture", () => {
    const dir = scratchDir();
    mkdirSync(join(dir, "nested"));
    writeFileSync(
      join(dir, "nested", "leaders.fixture.ts"),
      `export const LEADER = "someone@${"gmail"}.com";`,
    );
    expect(coachDataViolations(dir)).toEqual([
      `nested/leaders.fixture.ts: someone@${"gmail"}.com`,
    ]);
  });

  it("names a renamed copy of the dataset by the address inside it", () => {
    const dir = scratchDir();
    writeFileSync(
      join(dir, "roster.backup.md"),
      `leader: someone@${"gmail"}.com`,
    );
    expect(coachDataViolations(dir)).toEqual([
      `roster.backup.md: someone@${"gmail"}.com`,
    ]);
  });

  it("allows the reserved test domains, in any case", () => {
    for (const domain of [
      "Example.org",
      "EXAMPLE.COM",
      "a.test",
      "needs-real-email.invalid",
      "box.local",
      "versemate.org",
      "mail.versemate.org",
      "fireflies.ai",
    ])
      expect({ domain, ok: allowedDomain(domain) }).toEqual({
        domain,
        ok: true,
      });
    for (const domain of [
      "gmail.com",
      "notversemate.org",
      "example.org.evil",
      "notexample.com",
    ])
      expect({ domain, ok: allowedDomain(domain) }).toEqual({
        domain,
        ok: false,
      });
  });
});
