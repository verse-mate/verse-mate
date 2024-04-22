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
            Explain ${passage} from the ESV Bible in 500-600 words.
            The response should formatted using Markdown.
            Ensure to cover the significance to the reader.
            Remove references to the ESV Bible in the output.
          `,
        },
      ],
      model: "gpt-4-turbo"
      // model: "gpt-3.5-turbo-0125",
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
