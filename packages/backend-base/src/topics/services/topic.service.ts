import type { Topics } from "database/src/models/public/Topics";
import type { Static } from "elysia";
import type { Insertable } from "kysely";
import { BibleRepository } from "../../bible/repository/bible.repository";
import type { db } from "../../shared/shared.plugin";
import type { TopicDto, UpdateTopicDto } from "../dto/topic.dto";
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

  async getAllTopics() {
    return this.topicRepository.getAllTopics();
  }

  async getTopic(topicId: string) {
    return this.topicRepository.getTopic(topicId);
  }

  async createTopic(topic: Static<typeof TopicDto>) {
    return this.topicRepository.createTopic({
      name: topic.name,
      description: topic.description,
      category: topic.category,
      sort_order: topic.sort_order,
      is_active: topic.is_active,
    } as Insertable<Topics>);
  }

  async updateTopic(topicId: string, topic: Static<typeof UpdateTopicDto>) {
    return this.topicRepository.updateTopic(topicId, topic);
  }

  async deleteTopic(topicId: string) {
    return this.topicRepository.deleteTopic(topicId);
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
