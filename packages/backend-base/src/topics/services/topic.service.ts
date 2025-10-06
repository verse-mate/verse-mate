import { BibleRepository } from "../../bible/repository/bible.repository";
import type { db } from "../../shared/shared.plugin";
import { TopicRepository } from "../repository/topic.repository";

export class TopicService {
  private topicRepository: TopicRepository;
  private bibleRepository: BibleRepository;

  constructor(private readonly db: db) {
    this.topicRepository = new TopicRepository(this.db);
    this.bibleRepository = new BibleRepository(this.db);
  }

  async getCategories() {
    return this.topicRepository.getCategories();
  }

  async getTopicsByCategory(category: string) {
    return this.topicRepository.getTopicsByCategory(category);
  }

  async getTopic(topicId: string) {
    return this.topicRepository.getTopic(topicId);
  }

  async getTopicReferences(topicId: string) {
    return this.topicRepository.getTopicReferences(topicId);
  }

  async getTopicExplanation(
    topicId: string,
    languageCode: string,
    type: string,
  ) {
    return this.topicRepository.getTopicExplanation(
      topicId,
      languageCode,
      type,
    );
  }

  async parseTopicReferences(content: string, versionId: string) {
    // This will be implemented later.
    // It will parse and replace all placeholders in topic references content
    // with actual Bible text and subtitles.
    return content;
  }
}
