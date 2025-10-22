import type { Context } from "elysia";
import type { JWT, cache, db } from "../shared/shared.plugin";

export const adminGuard = {
  beforeHandle: async ({
    bearer,
    set,
    jwt,
    store: { db },
  }: {
    bearer: string | undefined;
    set: Context["set"];
    jwt: JWT;
    store: {
      cache: cache;
      db: db;
    };
  }): Promise<Error | undefined> => {
    // First check if user is authenticated
    const validBearer = await jwt.verify(bearer);
    if (!validBearer || !validBearer.sub) {
      set.status = 401;
      return new Error("Invalid bearer token");
    }

    // Check if user is admin
    const user = await db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", validBearer.sub)
      .select("is_admin")
      .executeTakeFirst();

    if (!user?.is_admin) {
      set.status = 403;
      return new Error("Admin access required");
    }
  },
};
