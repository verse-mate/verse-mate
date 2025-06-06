import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import type { db } from "../../shared/shared.plugin";

export class PromptRepository {
  constructor(private readonly db: db) {}

  async getActivePrompt(): Promise<{
    prompt_id: number;
    status: PromptStatusEnum;
    prompt: string;
  }> {
    const prompt = await this.db
      .getOrCreateConnection()
      .selectFrom("prompts")
      .select(["prompts.prompt_id", "prompts.prompt", "prompts.status"])
      .where("prompts.status", "=", PromptStatusEnum.active)
      .executeTakeFirst();

    if (!prompt) {
      throw new Error("Active Prompt not found");
    }

    return prompt;
  }
}
