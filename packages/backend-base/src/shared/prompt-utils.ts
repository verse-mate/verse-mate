import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { UserPromptRepository } from "../bible/repository/user-prompt.repository";
import { defaultUserPromptTemplates } from "./prompts";

export const getExplanationTypePrompt = async (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
  dbInstance: any,
  language: string,
): Promise<{ prompt: string; temperature: number }> => {
  try {
    const userPromptRepo = new UserPromptRepository(dbInstance);
    const promptTemplate = await userPromptRepo.getActivePromptByType(type);

    if (promptTemplate && (promptTemplate as any).prompt_template) {
      const temperature =
        type === ExplanationTypeEnum.detailed
          ? 0.1
          : type === ExplanationTypeEnum.byline
            ? 0.2
            : 0.3;
      return {
        prompt: (promptTemplate as any).prompt_template
          .replaceAll("{bookName}", bookName)
          .replaceAll("{chapterNumber}", chapterNumber.toString())
          .replaceAll("{language}", language)
          .replaceAll("{verseRange}", "all verses")
          .replaceAll("{verseRangeContext}", ""),
        temperature,
      };
    }
  } catch (error) {
    console.warn(
      "Failed to fetch prompt from database, using fallback:",
      error,
    );
  }

  // Fallback to hardcoded prompts if DB fails or template is missing
  const fallbackTemplate = defaultUserPromptTemplates.find(
    (t) => t.explanation_type === type,
  );

  if (fallbackTemplate) {
    const temperature =
      type === ExplanationTypeEnum.detailed
        ? 0.1
        : type === ExplanationTypeEnum.byline
          ? 0.2
          : 0.3;
    return {
      prompt: fallbackTemplate.prompt_template
        .replaceAll("{bookName}", bookName)
        .replaceAll("{chapterNumber}", chapterNumber.toString())
        .replaceAll("{language}", language)
        .replaceAll("{verseRange}", "all verses")
        .replaceAll("{verseRangeContext}", ""),
      temperature,
    };
  }

  throw new Error(`No prompt template found for type: ${type}`);
};
