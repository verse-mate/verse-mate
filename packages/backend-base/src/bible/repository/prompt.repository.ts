import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import type { db } from "../../shared/shared.plugin";

export class PromptRepository {
  constructor(private readonly db: db) {}

  async getActivePrompt(): Promise<{
    prompt_id: number;
    status: PromptStatusEnum;
    prompt: string;
    prompt_type: string;
  }> {
    const prompt = await this.db
      .getOrCreateConnection()
      .selectFrom("prompts")
      .select([
        "prompts.prompt_id",
        "prompts.prompt",
        "prompts.status",
        "prompts.prompt_type",
      ])
      .where("prompts.status", "=", PromptStatusEnum.active)
      .where("prompts.prompt_type", "=", "system")
      .executeTakeFirst();

    if (!prompt) {
      throw new Error("Active System Prompt not found");
    }

    return prompt as any;
  }

  async getAll() {
    return this.db
      .getOrCreateConnection()
      .selectFrom("prompts")
      .select([
        "prompts.prompt_id",
        "prompts.prompt",
        "prompts.status",
        "prompts.prompt_type",
      ])
      .execute();
  }

  async setAllInactive() {
    return this.db
      .getOrCreateConnection()
      .updateTable("prompts")
      .set({ status: PromptStatusEnum.inactive })
      .where("status", "=", PromptStatusEnum.active)
      .execute();
  }

  async create(
    prompt: string,
    status: PromptStatusEnum = PromptStatusEnum.active,
  ) {
    return this.db
      .getOrCreateConnection()
      .insertInto("prompts")
      .values({
        prompt,
        status,
      })
      .execute();
  }

  async update(id: number, prompt: string) {
    return this.db
      .getOrCreateConnection()
      .updateTable("prompts")
      .set({ prompt })
      .where("prompt_id", "=", id)
      .execute();
  }

  async delete(id: number) {
    return this.db
      .getOrCreateConnection()
      .deleteFrom("prompts")
      .where("prompt_id", "=", id)
      .execute();
  }

  async setStatus(id: number, status: PromptStatusEnum) {
    return this.db
      .getOrCreateConnection()
      .updateTable("prompts")
      .set({ status })
      .where("prompt_id", "=", id)
      .execute();
  }
}
