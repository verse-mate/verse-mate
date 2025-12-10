import type { Static } from "elysia";
import OpenAI from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { SubtitleService } from "../../bible/services/subtitle.service";
import type { db } from "../../shared/shared.plugin";
import { parseAndInjectVerses } from "../../shared/verse-parser";
import type { TopicDto, UpdateTopicDto } from "../dto/topic.dto";
import { TopicRepository } from "../repository/topic.repository";
import { getCategoryFromSlug } from "../utils/slug.utils";

export class TopicService {
  private topicRepository: TopicRepository;
  private bibleRepository: BibleRepository;
  private subtitleService: SubtitleService;
  private promptRepository: PromptRepository;

  constructor(private readonly db: db) {
    this.topicRepository = new TopicRepository(this.db);
    this.bibleRepository = new BibleRepository(this.db);
    this.subtitleService = new SubtitleService(this.bibleRepository);
    this.promptRepository = new PromptRepository(this.db);
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

  async getTopicsByCategory(category: string, languageCode?: string) {
    try {
      return await this.topicRepository.getTopicsByCategory(
        category,
        languageCode,
      );
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

  async getTopic(topicId: string, languageCode?: string) {
    try {
      return await this.topicRepository.getTopic(topicId, languageCode);
    } catch (error: unknown) {
      console.error(`Error fetching topic ${topicId}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch topic ${topicId}: ${errorMessage}`);
    }
  }

  /**
   * Get topic by category slug and topic slug (for deep linking)
   */
  async getTopicBySlug(
    categorySlug: string,
    topicSlug: string,
    languageCode = "en-US",
  ) {
    // Convert URL category slug to backend format
    const category = getCategoryFromSlug(categorySlug);

    if (!category) {
      throw new Error(`Invalid category slug: ${categorySlug}`);
    }

    const topic = await this.topicRepository.getTopicBySlug(
      category,
      topicSlug,
      languageCode,
    );

    if (!topic) {
      throw new Error(`Topic not found: ${categorySlug}/${topicSlug}`);
    }

    return topic;
  }

  async createTopic(topic: Static<typeof TopicDto>) {
    try {
      // Validate that category is one of the allowed values
      const validCategories = ["EVENT", "PROPHECY", "PARABLE", "THEME"];
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
        const validCategories = ["EVENT", "PROPHECY", "PARABLE", "THEME"];
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

      // First, try to get explanation in the requested language
      let explanation = await this.topicRepository.getTopicExplanation(
        topicId,
        languageCode,
        type,
      );

      // If no explanation found in requested language and it's not English, try English as fallback
      if (!explanation && languageCode !== "en-US") {
        explanation = await this.topicRepository.getTopicExplanation(
          topicId,
          "en-US",
          type,
        );
      }

      return explanation;
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
        { includeVerseNumbers: true },
      );
      return parsedContent;
    } catch (error: unknown) {
      console.error("Error parsing topic references:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse topic references: ${errorMessage}`);
    }
  }

  // New method for chronological sorting
  async sortTopicsChronologicallyByCategory(category: string) {
    try {
      // Get all topics in the category
      const topics = await this.topicRepository.getTopicsByCategory(category);

      if (topics.length === 0) {
        return { success: true, message: "No topics found in category" };
      }

      // Get the prompt for chronological sorting from the database
      const prompt =
        await this.promptRepository.getActivePromptByType("topic-order");

      // Format the topics data for the prompt (name and description only)
      const topicsData = topics
        .map(
          (topic, index) =>
            `${index + 1}. ${topic.name} - ${topic.description || "No description"}`,
        )
        .join("\n");

      // Call GPT-5 synchronously using the same pattern as bible.plugin.ts
      const openaiClient = new OpenAI({
        apiKey: process.env.OPEN_AI_KEY,
      });

      const response = await openaiClient.responses.create({
        model: "gpt-5",
        reasoning: { effort: "medium" },
        instructions: "", // We leave instructions empty as requested
        input: prompt.prompt
          .replace("{category_name}", category.toLowerCase())
          .replace("{topics_list}", topicsData),
        max_output_tokens: 50000,
      });

      // Parse the response - expect format: "1. Topic Name\n2. Topic Name\n..."
      const sortedLines = (response.output_text || "")
        .split("\n")
        .filter((line: string) => line.trim() !== "");
      const sortedTopicNames = sortedLines.map((line: string) => {
        // Extract topic name after the index (e.g., "1. Topic Name" -> "Topic Name")
        const match = line.match(/^\d+\.\s*(.+)$/);
        return match ? match[1].trim() : line.trim();
      });

      // Create a map of topic names to topic IDs for lookup
      const topicNameToIdMap = topics.reduce(
        (map, topic) => {
          map[topic.name] = topic.topic_id;
          return map;
        },
        {} as Record<string, string>,
      );

      // Update sort_order for each topic based on chronological position
      const updates = sortedTopicNames
        .map(async (topicName: string, index: number) => {
          const topicId = topicNameToIdMap[topicName];
          if (topicId) {
            return await this.topicRepository.updateTopic(topicId, {
              sort_order: index + 1,
            });
          }
          return null;
        })
        .filter(Boolean); // Remove null values

      await Promise.all(updates);

      return {
        success: true,
        message: `Successfully sorted ${sortedTopicNames.length} topics chronologically`,
        sortedCount: sortedTopicNames.length,
      };
    } catch (error: unknown) {
      console.error(`Error sorting topics for category ${category}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to sort topics for category ${category}: ${errorMessage}`,
      );
    }
  }
}
