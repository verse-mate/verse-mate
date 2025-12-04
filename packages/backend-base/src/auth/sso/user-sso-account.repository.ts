import type SsoProviderEnum from "database/src/models/public/SsoProviderEnum";
import type { NewUserSsoAccounts } from "database/src/models/public/UserSsoAccounts";
import type { db } from "../../shared/shared.plugin";

export class UserSsoAccountRepository {
  constructor(private readonly db: db) {}

  /**
   * Create a new SSO account link
   */
  async create(data: NewUserSsoAccounts) {
    const ssoAccount = await this.db
      .getOrCreateConnection()
      .insertInto("user_sso_accounts")
      .values(data)
      .returningAll()
      .executeTakeFirst();

    return ssoAccount;
  }

  /**
   * Find an SSO account by provider and provider user ID
   * Used to check if this SSO identity is already linked to a user
   */
  async findByProviderAndProviderId(
    provider: SsoProviderEnum,
    providerUserId: string,
  ) {
    const ssoAccount = await this.db
      .getOrCreateConnection()
      .selectFrom("user_sso_accounts")
      .where("provider", "=", provider)
      .where("provider_user_id", "=", providerUserId)
      .selectAll()
      .executeTakeFirst();

    return ssoAccount;
  }

  /**
   * Find all SSO accounts linked to a user
   * Used to show which providers a user has linked
   */
  async findByUserId(userId: string) {
    const ssoAccounts = await this.db
      .getOrCreateConnection()
      .selectFrom("user_sso_accounts")
      .where("user_id", "=", userId)
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();

    return ssoAccounts;
  }

  /**
   * Delete an SSO account link by ID
   */
  async delete(id: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("user_sso_accounts")
      .where("id", "=", id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Delete all SSO accounts for a user
   * Used when deleting a user account
   */
  async deleteAllByUserId(userId: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("user_sso_accounts")
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return result.numDeletedRows;
  }
}
