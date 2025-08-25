#!/usr/bin/env node

/**
 * CLI for the automated bug-fixing pipeline
 */

import { AutomatedBugFixer } from "./core/pipeline";
import type { PipelineConfig } from "./core/types";

// Default configuration
const defaultConfig: PipelineConfig = {
  maxRiskThreshold: 75,
  maxComplexityThreshold: "Moderate",
  testTimeout: 30000,
  screenshotPath: "./evidence/screenshots",
  videoPath: "./evidence/videos",
  branchPrefix: "auto-fix/",
  requireApprovalFor: ["High", "Critical"],
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: automated-bug-fixer <jira-ticket-id>");
    console.log("Example: automated-bug-fixer VM-123");
    process.exit(1);
  }

  const ticketId = args[0];

  console.log("🤖 Automated Bug Fixer v1.0.0");
  console.log("=".repeat(50));

  // Initialize the pipeline
  const bugFixer = new AutomatedBugFixer(defaultConfig);

  try {
    // Run the automated fix pipeline
    const result = await bugFixer.fixBug(ticketId);

    // Display results
    console.log("\n📊 Pipeline Results:");
    console.log("=".repeat(50));
    console.log(`Status: ${result.status}`);
    console.log(`Execution Time: ${(result.executionTime / 1000).toFixed(2)}s`);

    if (result.status === "SUCCESS") {
      console.log("✅ Bug fix completed successfully!");
      console.log(`🔗 PR: ${result.prUrl}`);
      console.log(`🌿 Branch: ${result.branchName}`);
      console.log(`🧪 Tests: ${result.testResults?.length} tests run`);

      if (result.testResults) {
        const passed = result.testResults.filter((t) => t.passed).length;
        const failed = result.testResults.length - passed;
        console.log(`   ✅ Passed: ${passed}`);
        if (failed > 0) console.log(`   ❌ Failed: ${failed}`);
      }
    } else if (result.status === "REQUIRES_HUMAN_REVIEW") {
      console.log("⏸️  Human review required");
      console.log(`📝 Reason: ${result.reason}`);

      if (result.fixPlan) {
        console.log("🎯 Proposed fix:");
        console.log(
          `   Files to modify: ${result.fixPlan.filesToModify.length}`,
        );
        console.log(`   Risk level: ${result.fixPlan.estimatedRisk}%`);
      }
    } else if (result.status === "SKIPPED") {
      console.log("⏭️  Bug skipped for automation");
      console.log(`📝 Reason: ${result.reason}`);
    } else {
      console.log("❌ Pipeline failed");
      console.log(`📝 Reason: ${result.reason}`);
    }

    // Display evidence summary
    if (result.evidence) {
      console.log("\n📸 Evidence collected:");
      console.log(`   Screenshots: ${result.evidence.afterScreenshots.length}`);
      console.log(`   Videos: ${result.evidence.testVideos.length}`);
      console.log(`   Test reports: ${result.evidence.testReports.length}`);
    }
  } catch (error) {
    console.error("\n❌ Pipeline error:", error);
    process.exit(1);
  }
}

// Handle CLI interruption
process.on("SIGINT", () => {
  console.log("\n🛑 Pipeline interrupted by user");
  process.exit(130);
});

// Run the CLI
if (require.main === module) {
  main().catch(console.error);
}

export { main };
