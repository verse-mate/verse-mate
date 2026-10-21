import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COACH_DIR = new URL(".", import.meta.url).pathname;
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
  for (const file of new Bun.Glob("**/*.{ts,json}").scanSync(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const [address, domain] of text.matchAll(ADDRESS))
      if (!allowedDomain(domain)) found.push(`${file}: ${address}`);
  }
  return found;
}

describe("the coaching dataset stays out of the repository", () => {
  it("the coach module holds no dataset and no real address", () => {
    expect(coachDataViolations(COACH_DIR)).toEqual([]);
  });

  it("names the file when the dataset comes back", () => {
    const dir = mkdtempSync(join(tmpdir(), "coach-guard-"));
    writeFileSync(join(dir, DATASET), "{}");
    expect(coachDataViolations(dir)).toEqual([`${DATASET} is committed again`]);
  });

  it("names the file and the address for a real address in a fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "coach-guard-"));
    mkdirSync(join(dir, "nested"));
    writeFileSync(
      join(dir, "nested", "leaders.fixture.ts"),
      `export const LEADER = "someone@${"gmail"}.com";`,
    );
    expect(coachDataViolations(dir)).toEqual([
      `nested/leaders.fixture.ts: someone@${"gmail"}.com`,
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
