module.exports = {
  "**/*": "biome check --write --no-errors-on-unmatched",
  "**/*.{ts,tsx}": () => "bunx tsc",
  "**/*.css": "stylelint --fix",
};
