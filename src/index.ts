import OpenAI from "openai";
import passages from "./passages";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY, // This is the default and can be omitted
});

// Function to check if a file exists
function checkFileExists(filePath: string): Promise<boolean> {
  return Bun.file(filePath).exists();
}

// Function to call the ChatGPT API using fetch
async function getExplanationForPassage(
  passage: string,
): Promise<string | null> {
  try {
    const chat = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `
            Provide an easy-to-understand explanation of the passage ${passage} from the ESV Bible.
            Begin with a brief introduction to the passage. Then, for each group of verses, provide a quotation followed by a detailed analysis that focuses on the overarching themes and insights related to those specific verses.
            Ensure the explanation is at least 500 words long.
            The response should be well-organized and formatted using Markdown, using headings for each verse, subheadings for major points, and bullet points to highlight key details.
          `,
        },
      ],
      model: "gpt-3.5-turbo-0125",
    });

    return chat.choices[0].message.content;
  } catch (error) {
    console.error("Error fetching explanation:", error);
    return null;
  }
}

// Main function to process all passages
async function processPassages() {
  for (const passage of Object.keys(passages)) {
    const fileName = `./explanations/${passage.replace(/[:\s]/g, "_")}.md`;

    // Check if the explanation file already exists
    if (await checkFileExists(fileName)) {
      console.log(`Skipping ${passage} - already processed`);
      continue;
    }

    console.log(`Requesting: ${passage}`);
    const explanation = await getExplanationForPassage(passages[passage]);
    if (explanation) {
      // Write the explanation to a new file
      await Bun.write(fileName, explanation);
      console.log(`Processed and saved: ${passage}`);
    } else {
      console.log(`Failed to fetch explanation for: ${passage}`);
    }
  }
}

// Call the main function
processPassages();
