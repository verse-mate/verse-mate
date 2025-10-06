import type { Topics } from "database/src/models/public/Topics";
import type { Static } from "elysia";
import type { Insertable } from "kysely";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { SubtitleService } from "../../bible/services/subtitle.service";
import type { db } from "../../shared/shared.plugin";
import { parseAndInjectVerses } from "../../shared/verse-parser";
import type { TopicDto, UpdateTopicDto } from "../dto/topic.dto";
import { TopicRepository } from "../repository/topic.repository";

export class TopicService {
  private topicRepository: TopicRepository;
  private bibleRepository: BibleRepository;
  private subtitleService: SubtitleService;

  constructor(private readonly db: db) {
    this.topicRepository = new TopicRepository(this.db);
    this.bibleRepository = new BibleRepository(this.db);
    this.subtitleService = new SubtitleService(this.bibleRepository);
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
    return this.topicRepository.createTopic(topic);
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

  async parseTopicReferences(content: string, bibleVersion: string) {
    const version = await this.bibleRepository.getVersionBykey(bibleVersion);
    if (!version) {
      throw new Error("Invalid bible version");
    }

    let parsedContent = await this.subtitleService.enhanceContentWithSubtitles(
      content,
      version.id,
    );
    parsedContent = await parseAndInjectVerses(
      parsedContent,
      bibleVersion,
      this.db,
    );
    return parsedContent;
  }
}
