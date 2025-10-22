import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

async function getFileContent(fileId: string) {
  if (!fileId) {
    console.error("Please provide an OpenAI file ID.");
    process.exit(1);
  }

  try {
    console.log(`Fetching content for file: ${fileId}`);
    const fileContent = await openai.files.content(fileId);
    const text = await fileContent.text();

    console.log("--- FILE CONTENT START ---");
    console.log(text);
    console.log("--- FILE CONTENT END ---");
  } catch (error) {
    console.error("Error fetching file content:", error);
    process.exit(1);
  }
}

const fileId = process.argv[2];
getFileContent(fileId);
