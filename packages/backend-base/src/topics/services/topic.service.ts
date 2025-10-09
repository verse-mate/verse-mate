import type { Static } from "elysia";
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
    try {
      return await this.topicRepository.getCategories();
    } catch (error: unknown) {
      console.error("Error fetching categories:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch categories: ${errorMessage}`);
    }
  }

  async getTopicsByCategory(category: string) {
    try {
      return await this.topicRepository.getTopicsByCategory(category);
    } catch (error: unknown) {
      console.error(`Error fetching topics for category ${category}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch topics for category ${category}: ${errorMessage}`,
      );
    }
  }

  async getAllTopics() {
    try {
      return await this.topicRepository.getAllTopics();
    } catch (error: unknown) {
      console.error("Error fetching all topics:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch all topics: ${errorMessage}`);
    }
  }

  async getTopic(topicId: string) {
    try {
      return await this.topicRepository.getTopic(topicId);
    } catch (error: unknown) {
      console.error(`Error fetching topic ${topicId}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch topic ${topicId}: ${errorMessage}`);
    }
  }

  async createTopic(topic: Static<typeof TopicDto>) {
    try {
      // Validate that category is one of the allowed values
      const validCategories = ["EVENT", "PROPHECY", "PARABLE"];
      if (!validCategories.includes(topic.category)) {
        throw new Error(
          `Invalid category: ${topic.category}. Must be one of: ${validCategories.join(", ")}`,
        );
      }

      return await this.topicRepository.createTopic(topic);
    } catch (error: unknown) {
      console.error("Error creating topic:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create topic: ${errorMessage}`);
    }
  }

  async updateTopic(topicId: string, topic: Static<typeof UpdateTopicDto>) {
    try {
      // Validate category if it's being updated
      if (topic.category) {
        const validCategories = ["EVENT", "PROPHECY", "PARABLE"];
        if (!validCategories.includes(topic.category)) {
          throw new Error(
            `Invalid category: ${topic.category}. Must be one of: ${validCategories.join(", ")}`,
          );
        }
      }

      // Check if topic exists before updating
      const existingTopic = await this.getTopic(topicId);
      if (!existingTopic) {
        throw new Error(`Topic with ID ${topicId} not found`);
      }

      return await this.topicRepository.updateTopic(topicId, topic);
    } catch (error: unknown) {
      console.error(`Error updating topic ${topicId}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update topic ${topicId}: ${errorMessage}`);
    }
  }

  async deleteTopic(topicId: string) {
    try {
      // Check if topic exists before deleting
      const existingTopic = await this.getTopic(topicId);
      if (!existingTopic) {
        throw new Error(`Topic with ID ${topicId} not found`);
      }

      return await this.topicRepository.deleteTopic(topicId);
    } catch (error: unknown) {
      console.error(`Error deleting topic ${topicId}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete topic ${topicId}: ${errorMessage}`);
    }
  }

  async getTopicReferences(topicId: string) {
    try {
      return await this.topicRepository.getTopicReferences(topicId);
    } catch (error: unknown) {
      console.error(
        `Error fetching topic references for topic ${topicId}:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch topic references for topic ${topicId}: ${errorMessage}`,
      );
    }
  }

  async saveTopicReferences(topicId: string, content: string) {
    try {
      // Validate that topic exists
      const existingTopic = await this.getTopic(topicId);
      if (!existingTopic) {
        throw new Error(`Topic with ID ${topicId} not found`);
      }

      // Validate content is not empty
      if (!content || content.trim().length === 0) {
        throw new Error("Content cannot be empty");
      }

      return await this.topicRepository.saveTopicReferences(topicId, content);
    } catch (error: unknown) {
      console.error(
        `Error saving topic references for topic ${topicId}:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to save topic references for topic ${topicId}: ${errorMessage}`,
      );
    }
  }

  async getTopicExplanation(
    topicId: string,
    languageCode: string,
    type: string,
  ) {
    try {
      // Validate parameters
      if (!topicId) {
        throw new Error("Topic ID is required");
      }
      if (!languageCode) {
        throw new Error("Language code is required");
      }
      if (!type) {
        throw new Error("Explanation type is required");
      }

      const validTypes = ["summary", "byline", "detailed"];
      if (!validTypes.includes(type)) {
        throw new Error(
          `Invalid explanation type: ${type}. Must be one of: ${validTypes.join(", ")}`,
        );
      }

      return await this.topicRepository.getTopicExplanation(
        topicId,
        languageCode,
        type,
      );
    } catch (error: unknown) {
      console.error(
        `Error fetching topic explanation for topic ${topicId}, language ${languageCode}, type ${type}:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch topic explanation for topic ${topicId}, language ${languageCode}, type ${type}: ${errorMessage}`,
      );
    }
  }

  async saveTopicExplanation(
    topicId: string,
    explanation: string,
    languageCode: string,
    type: string,
  ) {
    try {
      // Validate parameters
      if (!topicId) {
        throw new Error("Topic ID is required");
      }
      if (!languageCode) {
        throw new Error("Language code is required");
      }
      if (!type) {
        throw new Error("Explanation type is required");
      }
      if (!explanation || explanation.trim().length === 0) {
        throw new Error("Explanation content cannot be empty");
      }

      const validTypes = ["summary", "byline", "detailed"];
      if (!validTypes.includes(type)) {
        throw new Error(
          `Invalid explanation type: ${type}. Must be one of: ${validTypes.join(", ")}`,
        );
      }

      // Validate that topic exists
      const existingTopic = await this.getTopic(topicId);
      if (!existingTopic) {
        throw new Error(`Topic with ID ${topicId} not found`);
      }

      return await this.topicRepository.saveTopicExplanation(
        topicId,
        explanation,
        languageCode,
        type,
      );
    } catch (error: unknown) {
      console.error(
        `Error saving topic explanation for topic ${topicId}, language ${languageCode}, type ${type}:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to save topic explanation for topic ${topicId}, language ${languageCode}, type ${type}: ${errorMessage}`,
      );
    }
  }

  async parseTopicReferences(content: string, bibleVersion: string) {
    try {
      const version = await this.bibleRepository.getVersionBykey(bibleVersion);
      if (!version) {
        throw new Error(`Invalid bible version: ${bibleVersion}`);
      }

      let parsedContent =
        await this.subtitleService.enhanceContentWithSubtitles(
          content,
          version.id,
        );
      parsedContent = await parseAndInjectVerses(
        parsedContent,
        bibleVersion,
        this.db,
      );
      return parsedContent;
    } catch (error: unknown) {
      console.error("Error parsing topic references:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse topic references: ${errorMessage}`);
    }
  }
}
