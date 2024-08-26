import OpenAI from "openai";
import { parseBibleData } from "./bible";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY, // This is the default and can be omitted
});

// Function to check if a file exists
function checkFileExists(filePath: string): Promise<boolean> {
  return Bun.file(filePath).exists();
}

async function processBook(book: Book) {
  for (const chapter of book.chapters) {
    const versesText = formatChapterVerses(chapter);
    const fileName = `./explanations/${book.name}_Chapter_${chapter.chapterId}.md`;

    if (!(await checkFileExists(fileName))) {
      console.log(
        `Requesting explanation for ${book.name}, Chapter ${chapter.chapterId}`,
      );
      const explanation = await getExplanationForAllVerses(
        versesText,
        `${book.name} Chapter ${chapter.chapterId}`,
      );

      if (explanation) {
        await Bun.write(fileName, explanation);
        console.log(
          `Processed and saved explanation for ${book.name}, Chapter ${chapter.chapterId}`,
        );
      } else {
        console.log(
          `Failed to fetch explanation for ${book.name}, Chapter ${chapter.chapterId}`,
        );
      }
    } else {
      console.log(
        `Skipping ${book.name}, Chapter ${chapter.chapterId} - already processed`,
      );
    }
  }
}

function formatChapterVerses(chapter: Chapter): string {
  return chapter.verses
    .map((verse) => `${verse.verseId}. ${verse.text}`)
    .join(" ");
}

// Function to call the ChatGPT API using fetch
async function getExplanationForAllVerses(
  chapterVerses: string,
  chapterReference: string,
): Promise<string | null> {
  const prompt = `
    ### Detailed Biblical Passage Analysis

    **Passage Reference:** ${chapterReference}

    **Selected Passages for Analysis:**
    ${chapterVerses}

    **Request Overview:**
    Provide an in-depth yet accessible explanation of the above biblical passages. Focus on clarity and depth to help readers understand their significance and message.

    **Instructions:**

    1. **Introduction:**
       Begin with a brief introduction that contextualizes the passage within the Bible, highlighting its place in the broader narrative and any relevant background information.

    2. **Passage Analysis:**
       - **Quotation:** Use the selected passage(s) as headings.
       - **Analysis:** Provide a detailed examination focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details with bullet points.
       - **Connection to Broader Themes:** Where relevant, link the passage(s) to broader biblical themes or narratives.

    3. **Overall Significance:**
       Conclude with a discussion on the overall significance of the passage. Address how it contributes to the overarching narrative of the Bible and its relevance to contemporary readers.

    4. **Formatting:**
       - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights.
       - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage.
       - Aim for readability and engagement, making the analysis informative for both novice and experienced readers.

    **Content Requirements:**
    - **Accessibility:** Provide easy-to-understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar.
    - **Thoroughness:** Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text.
    - **Relevance:** Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.

    **Example Structure:**
    \`\`\`markdown
    ### Introduction

    [Brief contextual introduction to the passage here]

    ### Passage Analysis

    [Analysis of the passage, integrating quotations and thematic insights as instructed. Organize content with subheadings and bullet points where needed.]

    ### Overall Significance

    [Discussion on the broader implications and significance to the contemporary reader.]
    \`\`\`
  `;

  try {
    const chat = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-4o",
    });

    return chat.choices[0].message.content;
  } catch (error) {
    console.error("Error fetching explanation:", error);
    return null;
  }
}

// Main function to process all passages
async function main() {
  const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
  const bibleFile = Bun.file(`${import.meta.dir}/data/t_asv.json`);
  const bible = await parseBibleData(bibleFile, metadataFile);
  // Find Genesis and Matthew within the loaded Bible data
  const genesis = bible.books.find((book) => book.bookId === 1);
  const matthew = bible.books.find((book) => book.bookId === 40);

  if (genesis) {
    await processBook(genesis);
  }

  if (matthew) {
    await processBook(matthew);
  }
}

// Call the main function
main();
