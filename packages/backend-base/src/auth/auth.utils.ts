import type { Context } from "elysia";

import cacheConstants from "../shared/cache.constants";
import type { JWT, cache } from "../shared/shared.plugin";

export const authGuard = {
  beforeHandle: async ({
    bearer,
    set,
    jwt,
    store: { cache },
  }: {
    bearer: string | undefined;
    set: Context["set"];
    jwt: JWT;
    store: {
      cache: cache;
    };
  }): Promise<Error | undefined> => {
    const validBearer = await jwt.verify(bearer);

    if (!validBearer || !validBearer.sub) {
      set.status = 401;
      return new Error("Invalid bearer token");
    }

    const allTokens = await cache.get<string[]>(
      cacheConstants.accessToken(validBearer.sub),
    );
    const validToken = allTokens?.includes(bearer ?? "");
    if (!validToken) {
      set.status = 401;
      return new Error("Bearer token not in redis");
    }
  },
};

/**
 * Add currentUserId to context
 */
export const authDerive = async ({
  jwt,
  bearer,
  query,
}: {
  bearer: string | undefined;
  jwt: JWT;
  query: {
    accessToken?: string;
  };
}): Promise<{ currentUserId: string }> => {
  if (!bearer && !query?.accessToken) {
    console.error("No bearer token or accessToken");
    throw new Error("No bearer token or accessToken");
  }

  const validBearer = await jwt.verify(bearer ?? query.accessToken);

  if (!validBearer || !validBearer.sub) {
    console.error("Invalid bearer token");
    throw new Error("Invalid bearer token");
  }

  return {
    currentUserId: validBearer.sub,
  };
};
