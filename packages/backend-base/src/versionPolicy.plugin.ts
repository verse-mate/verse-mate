import { Elysia, t } from "elysia";
import { adminApiKeyGuard } from "./middleware/admin-api-key";
import { ipRateLimit } from "./middleware/rate-limit";
import shared from "./shared/shared.plugin";
import { liveStoreVersion, platformFrom } from "./storeVersions";
import { isGreaterThan, validateSemver } from "./utils/semver";

const VERSION_POLICY_KEY = "version_policy";

const DEFAULT_POLICY = {
  minVersion: "0.0.0",
  version: "0.0.0",
  releaseNotes: "",
};

type StoredPolicy = typeof DEFAULT_POLICY & { followStores?: boolean };

const VersionPolicyBody = t.Object({
  minVersion: t.String(),
  version: t.String(),
  releaseNotes: t.String(),
  // Default true: the asking platform's live store version raises minVersion
  // and version, so every new release offers itself once it is downloadable.
  followStores: t.Optional(t.Boolean()),
});

const higher = (a: string, b: string) => (isGreaterThan(b, a) ? b : a);

const plugin = new Elysia().use(shared).group("/api/version-policy", (app) =>
  app
    .get(
      "",
      async ({ store: { cache }, set, query, headers }) => {
        // The answer depends on the asking platform (query or User-Agent), so
        // no shared cache may keep one platform's answer for the other.
        set.headers["Cache-Control"] = "private, max-age=300";
        set.headers.Vary = "User-Agent";
        let stored: StoredPolicy = DEFAULT_POLICY;
        try {
          stored =
            (await cache.get<StoredPolicy>(VERSION_POLICY_KEY)) ??
            DEFAULT_POLICY;
        } catch {
          // fall back to the default policy
        }
        const policy = {
          minVersion: stored.minVersion,
          version: stored.version,
          releaseNotes: stored.releaseNotes,
        };
        if (stored.followStores === false) return policy;
        const platform = platformFrom(query.platform, headers["user-agent"]);
        if (!platform) return policy;
        const live = await liveStoreVersion(platform, cache);
        if (!live) return policy;
        return {
          ...policy,
          minVersion: higher(policy.minVersion, live),
          version: higher(policy.version, live),
        };
      },
      {
        beforeHandle: [ipRateLimit],
        query: t.Object({ platform: t.Optional(t.String()) }),
      },
    )
    .post(
      "",
      async ({ body, store: { cache }, set }) => {
        const { minVersion, version, releaseNotes, followStores } = body;

        try {
          validateSemver(minVersion);
          validateSemver(version);
        } catch (e: unknown) {
          set.status = 422;
          return {
            error: "UNPROCESSABLE_ENTITY",
            message: (e as Error).message,
          };
        }

        if (isGreaterThan(minVersion, version)) {
          set.status = 422;
          return {
            error: "UNPROCESSABLE_ENTITY",
            message: "minVersion must be ≤ version",
          };
        }

        const policy: StoredPolicy = { minVersion, version, releaseNotes };
        if (followStores !== undefined) policy.followStores = followStores;
        await cache.setPersistent(VERSION_POLICY_KEY, policy);
        return policy;
      },
      {
        beforeHandle: [adminApiKeyGuard],
        body: VersionPolicyBody,
      },
    ),
);

export type VersionPolicyPlugin = typeof plugin;
export default plugin;
