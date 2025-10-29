import type { NewRefreshTokens } from "database/src/models/public/RefreshTokens";
import type { db } from "../shared/shared.plugin";

export class RefreshTokenRepository {
  constructor(private readonly db: db) {}

  /**
   * Create a new refresh token
   */
  async create(data: NewRefreshTokens) {
    const token = await this.db
      .getOrCreateConnection()
      .insertInto("refresh_tokens")
      .values(data)
      .returningAll()
      .executeTakeFirst();

    return token;
  }

  /**
   * Find a refresh token by token string
   */
  async findByToken(token: string) {
    const now = new Date();
    const refreshToken = await this.db
      .getOrCreateConnection()
      .selectFrom("refresh_tokens")
      .where("token", "=", token)
      .where("expires_at", ">", now)
      .selectAll()
      .executeTakeFirst();

    return refreshToken;
  }

  /**
   * Update last_used_at timestamp and extend expiration
   */
  async updateLastUsed(id: string, newExpiresAt: Date) {
    const token = await this.db
      .getOrCreateConnection()
      .updateTable("refresh_tokens")
      .set({
        last_used_at: new Date(),
        expires_at: newExpiresAt,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    return token;
  }

  /**
   * Delete a specific refresh token (single logout)
   */
  async deleteByToken(token: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("refresh_tokens")
      .where("token", "=", token)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Delete all refresh tokens for a user (logout all)
   */
  async deleteAllByUserId(userId: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("refresh_tokens")
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return result.numDeletedRows;
  }

  /**
   * Get all active refresh tokens for a user (for session management)
   */
  async getAllByUserId(userId: string) {
    const now = new Date();
    const tokens = await this.db
      .getOrCreateConnection()
      .selectFrom("refresh_tokens")
      .where("user_id", "=", userId)
      .where("expires_at", ">", now)
      .selectAll()
      .orderBy("last_used_at", "desc")
      .execute();

    return tokens;
  }

  /**
   * Delete expired tokens (cleanup job)
   */
  async deleteExpired() {
    const now = new Date();
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("refresh_tokens")
      .where("expires_at", "<", now)
      .executeTakeFirst();

    return result.numDeletedRows;
  }
}
