import { isModel } from "./model-ids";

interface PerMillionUsd {
  input: number;
  output: number;
}

const STANDARD_PRICES: Record<string, PerMillionUsd> = {
  "gpt-6.1-sol": { input: 2, output: 10 },
  "gpt-6.1-terra": { input: 1, output: 5 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

const FLAGSHIP = STANDARD_PRICES["gpt-6.1-sol"];
const BATCH_DISCOUNT = 0.5;

function standardPrice(model: string): PerMillionUsd {
  const known = Object.keys(STANDARD_PRICES).find((id) => isModel(model, id));
  return known ? STANDARD_PRICES[known] : FLAGSHIP;
}

export function batchCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number {
  const price = standardPrice(model);
  const standard =
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output;
  return standard * BATCH_DISCOUNT;
}
