import type { api } from "backend-api";

type RecentlyViewedSync = NonNullable<
  Awaited<
    ReturnType<(typeof api.user)["recently-viewed-books"]["sync"]["post"]>
  >["data"]
>;

export const routeDataCarriesNoErrorShape: [
  Extract<RecentlyViewedSync, { error: unknown }>,
] extends [never]
  ? true
  : never = true;
