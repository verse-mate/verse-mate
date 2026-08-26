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
  store: { cache },
}: {
  bearer: string | undefined;
  jwt: JWT;
  query: {
    accessToken?: string;
  };
  store: {
    cache: cache;
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

  // Security (audit #5): a valid signature is not enough — the token must still
  // be in the user's Redis session list, or logout / password-reset would not
  // actually revoke it on authDerive-only routes (coach, support, bible, …).
  // Every issued token is stored there via loginUser, so this rejects only
  // revoked/expired-from-Redis tokens, matching authGuard's guarantee.
  const allTokens = await cache.get<string[]>(
    cacheConstants.accessToken(validBearer.sub),
  );
  if (!allTokens?.includes(token)) {
    return { currentUserId: null };
  }

  return {
    currentUserId: validBearer.sub,
  };
};
