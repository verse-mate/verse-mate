const migrateDev = () => {
  Bun.write(
    `./migrations/${String(new Date().toISOString())
      .replace(/[^0-9]/g, "")
      .slice(0, 14)}-new-migration.ts`,
    `import { Kysely } from "kysely";
  
  import Database from "../src/models/Database";
  
  export async function up(db: Kysely<Database>): Promise<void> {}
  
  export async function down(db: Kysely<Database>): Promise<void> {}
  `,
  );
};

export { migrateDev };
