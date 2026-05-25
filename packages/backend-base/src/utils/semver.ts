import semver from "semver";

export function validateSemver(version: string): string {
  const cleaned = semver.valid(version);
  if (!cleaned) {
    throw new Error(`Invalid semver: "${version}"`);
  }
  return cleaned;
}

export function isGreaterThan(a: string, b: string): boolean {
  return semver.gt(validateSemver(a), validateSemver(b));
}

export function isGreaterThanOrEqual(a: string, b: string): boolean {
  return semver.gte(validateSemver(a), validateSemver(b));
}
