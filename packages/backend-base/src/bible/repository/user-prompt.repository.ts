import type { db } from "../../shared/shared.plugin";

export class UserPromptRepository {
  constructor(private readonly db: db) {}

  async getActivePromptByType(explanationType: string) {
    console.log(
      `[TEMPLATE] Getting active prompt for type: ${explanationType}`,
    );

    try {
      const prompt = await this.db
        .getOrCreateConnection()
        .selectFrom("user_prompt_templates")
        .where("explanation_type", "=", explanationType)
        .where("status", "=", "active")
        .select([
          "id",
          "template_name",
          "explanation_type",
          "prompt_template",
          "status",
        ])
        .executeTakeFirst();

      if (prompt) {
        console.log(
          `[TEMPLATE] Found active prompt for ${explanationType}: ${prompt.template_name}`,
        );
      } else {
        console.log(`[TEMPLATE] No active prompt found for ${explanationType}`);
      }

      return prompt;
    } catch (error) {
      console.error(
        `[TEMPLATE] Error querying prompt for ${explanationType}:`,
        error,
      );
      return null;
    }
  }

  async getAllActivePrompts() {
    console.log("[TEMPLATE] Getting all active prompts");

    try {
      const prompts = await this.db
        .getOrCreateConnection()
        .selectFrom("user_prompt_templates")
        .where("status", "=", "active")
        .select([
          "id",
          "template_name",
          "explanation_type",
          "prompt_template",
          "status",
        ])
        .execute();

      console.log(`[TEMPLATE] Found ${prompts.length} active prompts`);
      return prompts;
    } catch (error) {
      console.error("[TEMPLATE] Error querying all active prompts:", error);
      return [];
    }
  }

  async updatePromptTemplate(id: number, promptTemplate: string) {
    console.log(`[TEMPLATE] Updating prompt template ${id}`);

    try {
      await this.db
        .getOrCreateConnection()
        .updateTable("user_prompt_templates")
        .set({
          prompt_template: promptTemplate,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();

      return { success: true, updatedId: id };
    } catch (error) {
      console.error(`[TEMPLATE] Error updating prompt template ${id}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async createPromptTemplate(
    templateName: string,
    explanationType: string,
    promptTemplate: string,
  ) {
    console.log(`[TEMPLATE] Creating prompt template: ${templateName}`);

    try {
      const result = await this.db
        .getOrCreateConnection()
        .insertInto("user_prompt_templates")
        .values({
          template_name: templateName,
          explanation_type: explanationType,
          prompt_template: promptTemplate,
          status: "active",
        })
        .returning([
          "id",
          "template_name",
          "explanation_type",
          "prompt_template",
          "status",
        ])
        .executeTakeFirst();

      if (result) {
        return result;
      }
      throw new Error("Failed to create prompt template");
    } catch (error) {
      console.error("[TEMPLATE] Error creating prompt template:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async deactivatePromptTemplate(id: number) {
    console.log(`[TEMPLATE] Deactivating prompt template ${id}`);

    try {
      await this.db
        .getOrCreateConnection()
        .updateTable("user_prompt_templates")
        .set({
          status: "inactive",
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();

      return { success: true, deactivatedId: id };
    } catch (error) {
      console.error(
        `[TEMPLATE] Error deactivating prompt template ${id}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
