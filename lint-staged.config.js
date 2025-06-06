module.exports = {
  "**/*": "biome format --write --no-errors-on-unmatched",
  // "**/*.{ts,tsx}": () => "bunx tsc", need to fix elysia types
  "**/*.{ts,tsx,parallel}": "biome check --write --no-errors-on-unmatched",
  "**/*.css": "stylelint --fix",
};
