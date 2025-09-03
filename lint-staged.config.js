module.exports = {
  "**/*": "biome format --write --no-errors-on-unmatched",
  "**/*.{ts,tsx}": () => "bunx tsc",
  "**/*.{ts,tsx,parallel}":
    "bun --bun run --workspace apps/frontend-next lint:fix",
  "**/*.css": "stylelint --fix",
};
