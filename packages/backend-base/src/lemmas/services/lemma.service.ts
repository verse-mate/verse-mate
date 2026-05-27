import type { db } from "../../shared/shared.plugin";
import { LemmaRepository } from "../repository/lemma.repository";

export class LemmaService {
  private lemmaRepository: LemmaRepository;

  constructor(private readonly db: db) {
    this.lemmaRepository = new LemmaRepository(this.db);
  }

  async getLemma(strongs: string, languageCode = "en") {
    try {
      return await this.lemmaRepository.getLemma(strongs, languageCode);
    } catch (error: unknown) {
      console.error(
        `Error fetching lemma ${strongs} (${languageCode}):`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch lemma: ${errorMessage}`);
    }
  }
}
