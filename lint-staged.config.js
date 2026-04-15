module.exports = {
  "**/*": (files) => {
    const filtered = files.filter((f) => !f.includes("apps/lovable"));
    return filtered.length
      ? `biome check --write --no-errors-on-unmatched ${filtered.join(" ")}`
      : "echo skip";
  },
  "**/*.{ts,tsx}": () => "bunx tsc",
  "**/*.css": (files) => {
    const filtered = files.filter((f) => !f.includes("apps/lovable"));
    return filtered.length
      ? `stylelint --fix ${filtered.join(" ")}`
      : "echo skip";
  },
};
