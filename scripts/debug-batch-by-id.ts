import OpenAI from "openai";
import "dotenv/config";
import { db } from "database";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

async function debugBatchById(batchId: string) {
  if (!batchId) {
    console.error("Please provide a batch ID (e.g., batch_xxx...)");
    process.exit(1);
  }

  try {
    console.log(`\n=== Debugging Batch: ${batchId} ===\n`);

    // Get batch info from OpenAI
    console.log("Fetching batch info from OpenAI...");
    const batch = await openai.batches.retrieve(batchId);

    console.log("Batch Status:", batch.status);
    console.log("Output File ID:", batch.output_file_id);
    console.log("Error File ID:", batch.error_file_id);

    if (!batch.output_file_id) {
      console.log("\nNo output file available yet. Batch status:", batch.status);

      // Check DB for more info
      const dbBatch = await db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .selectAll()
        .executeTakeFirst();

      if (dbBatch) {
        console.log("\nDatabase info:");
        console.log("  DB Status:", dbBatch.status);
        console.log("  Batch Type:", dbBatch.batch_type);
        console.log("  Book ID:", dbBatch.book_id);
        console.log("  Model:", dbBatch.model);
      }

      process.exit(0);
    }

    // Fetch and parse output file
    console.log(`\nFetching output file: ${batch.output_file_id}`);
    const fileContent = await openai.files.content(batch.output_file_id);
    const text = await fileContent.text();

    console.log("\n--- RAW FILE CONTENT (first 500 chars) ---");
    console.log(text.substring(0, 500));
    console.log("...\n");

    // Parse JSONL and show structure
    console.log("--- PARSED STRUCTURE ---");
    const lines = text.split("\n").filter((line) => line.trim() !== "");

    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      const parsed = JSON.parse(lines[i]);
      console.log(`\n=== Response ${i + 1} of ${lines.length} ===`);
      console.log("Custom ID:", parsed.custom_id);
      console.log("Status Code:", parsed.response?.status_code);
      console.log("Has output_text:", !!parsed.response?.body?.output_text);
      console.log("Has output array:", !!parsed.response?.body?.output);

      if (parsed.response?.body?.output_text) {
        console.log(
          "\nOutput Text (first 300 chars):",
          parsed.response.body.output_text.substring(0, 300),
        );
      }

      if (parsed.response?.body?.output) {
        console.log("\nOutput array length:", parsed.response.body.output.length);
        if (parsed.response.body.output.length > 1) {
          const outputItem = parsed.response.body.output[1];
          console.log("Output[1] type:", outputItem?.type);
          console.log("Output[1] content length:", outputItem?.content?.length);
          if (outputItem?.content?.[0]?.text) {
            console.log(
              "\nOutput[1].content[0].text (first 300 chars):",
              outputItem.content[0].text.substring(0, 300),
            );
          }
        }
      }

      if (parsed.response?.body?.error) {
        console.log("\n❌ ERROR:", JSON.stringify(parsed.response.body.error, null, 2));
      }

      console.log("\n--- Full response.body structure ---");
      console.log(JSON.stringify(parsed.response?.body, null, 2));
    }

    console.log(`\n✅ Total responses: ${lines.length}`);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const batchId = process.argv[2];
debugBatchById(batchId);
