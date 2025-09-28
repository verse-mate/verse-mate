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
}): Promise<{ currentUserId: string | null }> => {
  const token = bearer ?? query.accessToken;

  if (!token) {
    return { currentUserId: null };
  }

  const validBearer = await jwt.verify(token);

  if (!validBearer || !validBearer.sub) {
    return { currentUserId: null };
  }

  return {
    currentUserId: validBearer.sub,
  };
};
