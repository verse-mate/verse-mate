import { describe, expect, it } from "bun:test";
import { batchCostUsd } from "./model-pricing";

const MILLION = 1_000_000;

describe("batchCostUsd", () => {
  it("prices each replacement model at its own batch rate, half the standard per-million price", () => {
    expect(batchCostUsd(MILLION, MILLION, "gpt-6-luna")).toBeCloseTo(0.3);
    expect(batchCostUsd(MILLION, MILLION, "gpt-6.1-terra")).toBeCloseTo(3);
    expect(batchCostUsd(MILLION, MILLION, "gpt-6.1-sol")).toBeCloseTo(6);
  });

  it("keeps the retired models' rates for batches submitted before the switch", () => {
    expect(batchCostUsd(MILLION, MILLION, "gpt-5-nano")).toBeCloseTo(0.225);
    expect(batchCostUsd(MILLION, MILLION, "gpt-5-mini")).toBeCloseTo(1.125);
    expect(batchCostUsd(MILLION, MILLION, "gpt-5")).toBeCloseTo(5.625);
  });

  it("matches dated snapshots and never lets a shorter id stand in for a longer one", () => {
    expect(batchCostUsd(MILLION, 0, "gpt-5-nano-2025-08-07")).toBeCloseTo(
      0.025,
    );
    expect(batchCostUsd(MILLION, 0, "gpt-5.4-nano-2026-03-17")).toBeCloseTo(
      0.1,
    );
    expect(batchCostUsd(0, MILLION, "GPT-6-Luna")).toBeCloseTo(0.25);
    expect(
      batchCostUsd(MILLION, MILLION, "gpt-5.4-mini-2026-03-17"),
    ).toBeCloseTo(2.625);
    expect(batchCostUsd(MILLION, MILLION, "gpt-5-pro")).toBeCloseTo(6);
  });

  it("prices an unknown model at the flagship rate, so an estimate errs high rather than low", () => {
    expect(batchCostUsd(MILLION, MILLION, "some-new-model")).toBeCloseTo(6);
  });
});
