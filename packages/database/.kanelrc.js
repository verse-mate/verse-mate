const { resolveType } = require("kanel");
const { makeKyselyHook } = require("kanel-kysely");
const { recase } = require("@kristiandupont/recase");

const toPascalCase = recase("snake", "pascal");

/** @type {import("kanel").Config} */
module.exports = {
  preDeleteOutputFolder: true,
  outputPath: "./src/models",
  connection: {
    connectionString: process.env.POSTGRES_URL,
  },
  customTypeMap: {
    "pg_catalog.numeric": "number",
  },
  preRenderHooks: [makeKyselyHook()],
  generateIdentifierType: (column, details, config) => {
    const innerType = resolveType(column, details, {
      ...config,
      generateIdentifierType: undefined,
    });

    const name = toPascalCase(`${details.name}_${column.name}`);

    return {
      declarationType: "typeDeclaration",
      exportAs: "named",
      typeDefinition: [innerType],
      name,
      comment: [],
    };
  },
};
