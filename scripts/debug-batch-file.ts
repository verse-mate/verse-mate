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

    console.log("--- RAW FILE CONTENT START ---");
    console.log(text);
    console.log("--- RAW FILE CONTENT END ---");

    // Parse JSONL and show structure
    console.log("\n--- PARSED STRUCTURE ---");
    const lines = text.split("\n").filter((line: string) => line.trim() !== "");

    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      const parsed = JSON.parse(lines[i]);
      console.log(`\n=== Line ${i + 1} ===`);
      console.log("Custom ID:", parsed.custom_id);
      console.log("Status Code:", parsed.response?.status_code);
      console.log("Has output_text:", !!parsed.response?.body?.output_text);
      console.log("Has output array:", !!parsed.response?.body?.output);

      if (parsed.response?.body?.output_text) {
        console.log(
          "Output Text (first 200 chars):",
          parsed.response.body.output_text.substring(0, 200),
        );
      }

      if (parsed.response?.body?.output) {
        console.log("Output array length:", parsed.response.body.output.length);
        if (parsed.response.body.output.length > 1) {
          const outputItem = parsed.response.body.output[1];
          console.log("Output[1] type:", outputItem?.type);
          console.log("Output[1] content length:", outputItem?.content?.length);
          if (outputItem?.content?.[0]?.text) {
            console.log(
              "Output[1].content[0].text (first 200 chars):",
              outputItem.content[0].text.substring(0, 200),
            );
          }
        }
      }

      console.log("\nFull response.body structure:");
      console.log(JSON.stringify(parsed.response?.body, null, 2));
    }

    console.log(`\nTotal lines: ${lines.length}`);
  } catch (error) {
    console.error("Error fetching file content:", error);
    process.exit(1);
  }
}

const fileId = process.argv[2];
getFileContent(fileId);
