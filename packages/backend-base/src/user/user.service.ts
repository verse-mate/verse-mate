import type { db } from "../shared/shared.plugin";
import type { User } from "./entities/user.entity";

export class UserService {
  constructor(private readonly db: db) {}

  async findOne(userId: string): Promise<User> {
    const user = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .where("id", "=", userId)
      .selectAll()
      .executeTakeFirstOrThrow();

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      emailVerified: user.emailVerified,
    };
  }

  // TODO: pagination
  async findAll(): Promise<User[]> {
    const users = await this.db
      .getOrCreateConnection()
      .selectFrom("user")
      .selectAll()
      .orderBy("firstName asc")
      .execute();

    return await Promise.all(
      users.map(async ({ id, email, firstName, lastName }) => ({
        id,
        email,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      })),
    );
  }
}
