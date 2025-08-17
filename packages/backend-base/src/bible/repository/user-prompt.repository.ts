import type { db } from "../../shared/shared.plugin";

export class UserPromptRepository {
  constructor(private readonly db: db) {}

  async getActivePromptByType(explanationType: string) {
    console.log(
      `[TEMPLATE] Getting active prompt for type: ${explanationType}`,
    );

    return null;
  }

  async getAllActivePrompts() {
    console.log("[TEMPLATE] Getting all active prompts");

    return [
      {
        id: 1,
        template_name: "summary",
        explanation_type: "summary",
        prompt_template: "Summary template...",
        status: "active",
      },
      {
        id: 2,
        template_name: "byline",
        explanation_type: "byline",
        prompt_template: "Byline template...",
        status: "active",
      },
      {
        id: 3,
        template_name: "detailed",
        explanation_type: "detailed",
        prompt_template: "Detailed template...",
        status: "active",
      },
    ];
  }

  async updatePromptTemplate(id: number, promptTemplate: string) {
    console.log(`[TEMPLATE] Updating prompt template ${id}`);

    return { success: true, updatedId: id };
  }

  async createPromptTemplate(
    templateName: string,
    explanationType: string,
    promptTemplate: string,
  ) {
    console.log(`[TEMPLATE] Creating prompt template: ${templateName}`);

    return {
      id: Math.floor(Math.random() * 1000),
      template_name: templateName,
      explanation_type: explanationType,
      prompt_template: promptTemplate,
      status: "active",
    };
  }

  async deactivatePromptTemplate(id: number) {
    console.log(`[TEMPLATE] Deactivating prompt template ${id}`);

    return { success: true, deactivatedId: id };
  }
}
