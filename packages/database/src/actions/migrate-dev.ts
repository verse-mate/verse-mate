const migrateDev = (name?: string) => {
  const migrationName = name
    ? name.replace(/\s+/g, "-").toLowerCase()
    : "new-migration";
  const fileName = `${String(new Date().toISOString())
    .replace(/[^0-9]/g, "")
    .slice(0, 14)}-${migrationName}.ts`;

  Bun.write(
    `./migrations/${fileName}`,
    `import { Kysely } from "kysely";
  
  import Database from "../src/models/Database";
  
  export async function up(db: Kysely<Database>): Promise<void> {}
  
  export async function down(db: Kysely<Database>): Promise<void> {}
  `,
  );
};

export { migrateDev };
