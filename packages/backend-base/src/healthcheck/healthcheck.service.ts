import type { cache, db } from "../shared/shared.plugin";

type StatusCheck = {
  status: "ok" | "fail";
  message: string;
};

export class HealthCheckService {
  constructor(
    private readonly db: db,
    private readonly cache: cache,
  ) {}

  async checkDatabase(): Promise<StatusCheck> {
    try {
      await this.db
        .getOrCreateConnection()
        .selectFrom("kysely_migration")
        .executeTakeFirst();
      return { status: "ok", message: "database connection ok" };
    } catch (error) {
      console.error("Failed database connection check:", error);
      return { status: "fail", message: "database connection failed" };
    }
  }

  async checkCache(): Promise<StatusCheck> {
    try {
      await this.cache.set("health-check", {}, "1m");
      return { status: "ok", message: "cache connection ok" };
    } catch (error) {
      console.error("Failed cache connection check:", error);
      return { status: "fail", message: "cache connection failed" };
    }
  }

  async checkAll(): Promise<{
    status: StatusCheck["status"];
    database: StatusCheck;
    cache: StatusCheck;
  }> {
    const [dbStatus, cacheStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
    ]);

    return {
      status:
        dbStatus.status === "ok" && cacheStatus.status === "ok" ? "ok" : "fail",
      database: dbStatus,
      cache: cacheStatus,
    };
  }
}
