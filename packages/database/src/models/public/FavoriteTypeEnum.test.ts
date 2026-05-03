import { describe, expect, it } from "bun:test";
import FavoriteTypeEnum from "./FavoriteTypeEnum";

/**
 * Lock the FavoriteTypeEnum values per spec feat-domain-model br-domain-011 (D-019).
 *
 * `message` was renamed to `insight` to align DB enum with mobile UI naming.
 *
 * Migration: `migrations/20260503120000-rename-favorite-type-message-to-insight.ts`.
 */
describe("FavoriteTypeEnum (post-D-019 rename)", () => {
  it("has exactly 2 values: chapter, insight", () => {
    const values = Object.values(FavoriteTypeEnum);
    expect(values).toHaveLength(2);
    expect(values).toContain("chapter");
    expect(values).toContain("insight");
  });

  it("does NOT contain the legacy 'message' value", () => {
    const values = Object.values(FavoriteTypeEnum);
    expect(values).not.toContain("message");
  });

  it("string values match key names (TypeScript convention)", () => {
    expect(FavoriteTypeEnum.chapter).toBe(FavoriteTypeEnum.chapter);
    expect(FavoriteTypeEnum.insight).toBe(FavoriteTypeEnum.insight);
    expect(String(FavoriteTypeEnum.chapter)).toBe("chapter");
    expect(String(FavoriteTypeEnum.insight)).toBe("insight");
  });
});
