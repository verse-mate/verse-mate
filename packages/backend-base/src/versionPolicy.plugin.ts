import { Elysia, t } from "elysia";
import { adminApiKeyGuard } from "./middleware/admin-api-key";
import { ipRateLimit } from "./middleware/rate-limit";
import shared from "./shared/shared.plugin";
import { isGreaterThan, validateSemver } from "./utils/semver";

const VERSION_POLICY_KEY = "version_policy";

const DEFAULT_POLICY = {
  minVersion: "0.0.0",
  version: "0.0.0",
  releaseNotes: "",
};

const VersionPolicyBody = t.Object({
  minVersion: t.String(),
  version: t.String(),
  releaseNotes: t.String(),
});

const plugin = new Elysia().use(shared).group("/api/version-policy", (app) =>
  app
    .get(
      "",
      async ({ store: { cache }, set }) => {
        set.headers["Cache-Control"] = "public, max-age=300";
        try {
          const policy =
            await cache.get<typeof DEFAULT_POLICY>(VERSION_POLICY_KEY);
          return policy ?? DEFAULT_POLICY;
        } catch {
          return DEFAULT_POLICY;
        }
      },
      {
        beforeHandle: [ipRateLimit],
      },
    )
    .post(
      "",
      async ({ body, store: { cache }, set }) => {
        const { minVersion, version, releaseNotes } = body;

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

        const policy = { minVersion, version, releaseNotes };
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
