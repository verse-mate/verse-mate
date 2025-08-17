import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type { db } from "../../shared/shared.plugin";

export class AdminDatabaseService {
  constructor(private readonly db: db) {}

  async deleteExplanation(explanationId: string) {
    const result = await this.db
      .getOrCreateConnection()
      .deleteFrom("explanations")
      .where("explanation_id", "=", Number(explanationId))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new Error(`Explanation ${explanationId} not found`);
    }

    return {
      success: true,
      deletedId: explanationId,
      deletedAt: new Date(),
    };
  }

  async regenerateExplanation(
    bookId: number,
    chapterNumber: number,
    explanationType: ExplanationTypeEnum,
    bibleVersion: string,
    adminUserId: string,
  ) {
    const connection = this.db.getOrCreateConnection();

    const { chapter_id } = (await connection
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .where("chapter_number", "=", chapterNumber)
      .select("chapter_id")
      .executeTakeFirst()) || { chapter_id: null };

    if (!chapter_id) {
      throw new Error(`Chapter ${chapterNumber} not found for book ${bookId}`);
    }

    const currentExplanation = await connection
      .selectFrom("explanations")
      .where("chapter_id", "=", chapter_id)
      .where("type", "=", explanationType)
      .where("version_id", "=", bibleVersion)
      .select(["explanation_id", "explanation"])
      .executeTakeFirst();

    if (!currentExplanation) {
      throw new Error(
        `No explanation found for chapter ${chapterNumber}, type ${explanationType}`,
      );
    }

    return {
      success: true,
      regenerationId: `regen_${bookId}_${chapterNumber}_${explanationType}_${Date.now()}`,
      currentExplanation: {
        id: currentExplanation.explanation_id,
        content: currentExplanation.explanation,
        version: 1,
      },
      bookId,
      chapterNumber,
      explanationType,
      bibleVersion,
      adminUserId,
      status: "pending_generation",
      createdAt: new Date(),
    };
  }

  async saveRegeneratedExplanation(
    regenerationId: string,
    newExplanationContent: string,
    originalExplanationId: number,
    chapterId: number,
    explanationType: ExplanationTypeEnum,
    bibleVersion: string,
    adminUserId: string,
  ) {
    console.log(
      `[TEMPLATE] Saving regenerated explanation for ${regenerationId}`,
    );
    console.log(
      `Original ID: ${originalExplanationId}, New content length: ${newExplanationContent.length}`,
    );

    return {
      success: true,
      regenerationId,
      newExplanation: {
        id: Math.floor(Math.random() * 10000),
        content: newExplanationContent,
        version: 2,
        isActive: false,
      },
      status: "awaiting_admin_choice",
    };
  }

  async getExplanationComparison(regenerationId: string) {
    const parts = regenerationId.split("_");
    if (parts.length < 4) {
      throw new Error("Invalid regeneration ID format");
    }

    const bookId = Number(parts[1]);
    const chapterNumber = Number(parts[2]);
    const explanationType = parts[3] as ExplanationTypeEnum;

    const connection = this.db.getOrCreateConnection();

    const { chapter_id } = (await connection
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .where("chapter_number", "=", chapterNumber)
      .select("chapter_id")
      .executeTakeFirst()) || { chapter_id: null };

    if (!chapter_id) {
      throw new Error("Chapter not found");
    }

    const currentExplanation = await connection
      .selectFrom("explanations")
      .where("chapter_id", "=", chapter_id)
      .where("type", "=", explanationType)
      .where("version_id", "=", parts[4] || "ESV")
      .select(["explanation_id", "explanation"])
      .executeTakeFirst();

    return {
      regenerationId,
      bookId,
      chapterNumber,
      explanationType,
      comparison: {
        current: currentExplanation
          ? {
              id: currentExplanation.explanation_id,
              content: currentExplanation.explanation,
              version: 1,
              createdAt: new Date(),
            }
          : null,
        new: {
          id: Math.floor(Math.random() * 10000),
          content: `[REGENERATED] This is a placeholder for the new AI-generated explanation for ${parts[3]} of chapter ${chapterNumber}. In a real implementation, this would contain the newly generated content.`,
          version: 2,
          createdAt: new Date(),
        },
      },
    };
  }

  async chooseExplanationVersion(
    regenerationId: string,
    chosenExplanationId: number,
    adminUserId: string,
  ) {
    console.log(
      `[TEMPLATE] Admin ${adminUserId} chose explanation ${chosenExplanationId} for ${regenerationId}`,
    );

    const parts = regenerationId.split("_");
    const isNewVersion = chosenExplanationId > 10000;

    if (isNewVersion) {
      return {
        success: true,
        message:
          "New explanation would be activated, old version would be deleted",
        chosenVersion: "new",
        regenerationId,
        chosenExplanationId,
      };
    }
    return {
      success: true,
      message: "Current explanation kept, new version would be deleted",
      chosenVersion: "current",
      regenerationId,
      chosenExplanationId,
    };
  }

  async getExplanationStats() {
    console.log("[TEMPLATE] Getting explanation statistics");

    return {
      totalExplanations: 0,
      explanationsByType: {
        summary: 0,
        byline: 0,
        detailed: 0,
      },
      explanationsByBook: {},
      explanationsByVersion: {},
      recentActivity: [],
      lastUpdated: new Date(),
    };
  }

  async bulkDeleteExplanations(criteria: {
    bookId?: number;
    explanationType?: string;
    bibleVersion?: string;
    dateRange?: { from: string; to: string };
  }) {
    console.log(
      "[TEMPLATE] Bulk deleting explanations with criteria:",
      criteria,
    );

    return {
      success: true,
      deletedCount: 0,
      criteria,
      deletedAt: new Date(),
    };
  }

  async getExplanationHistory(explanationId: string) {
    console.log(`[TEMPLATE] Getting explanation history for: ${explanationId}`);

    return {
      explanationId,
      versions: [],
      currentVersion: null,
      totalVersions: 0,
    };
  }
}
