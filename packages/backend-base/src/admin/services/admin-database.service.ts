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

    if (result.numDeletedRows === BigInt(0)) {
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
    console.log(`Saving regenerated explanation for ${regenerationId}`);
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
          content: `New AI-generated explanation for ${parts[3]} of chapter ${chapterNumber}. This would contain the newly generated content from the regeneration process.`,
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
      `Admin ${adminUserId} chose explanation ${chosenExplanationId} for ${regenerationId}`,
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
    const connection = this.db.getOrCreateConnection();

    const totalExplanations = await connection
      .selectFrom("explanations")
      .select(({ fn }) => fn.count<number>("explanation_id").as("count"))
      .executeTakeFirst();

    const explanationsByType = await connection
      .selectFrom("explanations")
      .select([
        "type",
        ({ fn }) => fn.count<number>("explanation_id").as("count"),
      ])
      .groupBy("type")
      .execute();

    const explanationsByBook = await connection
      .selectFrom("explanations")
      .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
      .innerJoin("books", "chapters.book_id", "books.book_id")
      .select([
        "books.name",
        ({ fn }) => fn.count<number>("explanation_id").as("count"),
      ])
      .groupBy("books.name")
      .execute();

    return {
      totalExplanations: totalExplanations?.count || 0,
      explanationsByType: explanationsByType.reduce(
        (acc, item) => {
          acc[item.type] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      explanationsByBook: explanationsByBook.reduce(
        (acc, item) => {
          acc[item.name] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
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
    let query = this.db.getOrCreateConnection().deleteFrom("explanations");

    if (criteria.bookId !== undefined) {
      const bookId = criteria.bookId;
      query = query.where("chapter_id", "in", (eb) =>
        eb
          .selectFrom("chapters")
          .select("chapter_id")
          .where("book_id", "=", bookId),
      );
    }

    if (criteria.explanationType) {
      query = query.where("type", "=", criteria.explanationType as any);
    }

    if (criteria.bibleVersion) {
      query = query.where("version_id", "=", criteria.bibleVersion);
    }

    if (criteria.dateRange) {
      query = query
        .where("created_at", ">=", new Date(criteria.dateRange.from))
        .where("created_at", "<=", new Date(criteria.dateRange.to));
    }

    const result = await query.executeTakeFirst();

    return {
      success: true,
      deletedCount: Number(result.numDeletedRows),
      criteria,
      deletedAt: new Date(),
    };
  }

  async getExplanationHistory(explanationId: string) {
    const connection = this.db.getOrCreateConnection();

    const explanation = await connection
      .selectFrom("explanations")
      .where("explanation_id", "=", Number(explanationId))
      .selectAll()
      .executeTakeFirst();

    if (!explanation) {
      throw new Error(`Explanation ${explanationId} not found`);
    }

    return {
      explanationId,
      versions: [explanation],
      currentVersion: explanation,
      totalVersions: 1,
    };
  }
}
