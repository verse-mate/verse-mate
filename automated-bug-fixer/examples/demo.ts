/**
 * Demo script for the automated bug-fixing pipeline
 */

import { AutomatedBugFixer } from "../core/pipeline";
import type { PipelineConfig } from "../core/types";

// Demo configuration
const demoConfig: PipelineConfig = {
  maxRiskThreshold: 75,
  maxComplexityThreshold: "Moderate",
  testTimeout: 30000,
  screenshotPath: "./evidence/screenshots",
  videoPath: "./evidence/videos",
  branchPrefix: "auto-fix/",
  requireApprovalFor: ["High", "Critical"],
};

async function runDemo() {
  console.log("🤖 Automated Bug Fixer - Demo Mode");
  console.log("=".repeat(60));
  console.log("This demo simulates fixing a real bug from our PR feedback");
  console.log("");

  // Initialize the pipeline
  const bugFixer = new AutomatedBugFixer(demoConfig);

  // Test with a simulated ticket that matches our recent work
  const testTicketId = "VM-001";

  console.log(`🎯 Testing with ticket: ${testTicketId}`);
  console.log(`📝 Simulated bug: "Button not responding on mobile devices"`);
  console.log("");

  try {
    // Run the automated fix pipeline
    const result = await bugFixer.fixBug(testTicketId);

    // Display comprehensive results
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 PIPELINE EXECUTION RESULTS");
    console.log("=".repeat(60));

    console.log(`🏷️  Ticket ID: ${result.jiraTicketId}`);
    console.log(`📈 Status: ${result.status}`);
    console.log(
      `⏱️  Execution Time: ${(result.executionTime / 1000).toFixed(2)}s`,
    );

    if (result.reason) {
      console.log(`📝 Reason: ${result.reason}`);
    }

    if (result.status === "SUCCESS") {
      console.log("\n🎉 SUCCESS - Bug fix completed!");
      console.log(`🔗 Pull Request: ${result.prUrl}`);
      console.log(`🌿 Branch: ${result.branchName}`);

      if (result.testResults) {
        console.log("\n🧪 Test Results:");
        const passed = result.testResults.filter((t) => t.passed).length;
        const total = result.testResults.length;
        console.log(`   ✅ Passed: ${passed}/${total}`);

        result.testResults.forEach((test) => {
          const icon = test.passed ? "✅" : "❌";
          console.log(`   ${icon} ${test.testName} (${test.duration}ms)`);
        });
      }

      if (result.evidence) {
        console.log("\n📸 Evidence Collected:");
        console.log(
          `   📷 Screenshots: ${result.evidence.afterScreenshots.length}`,
        );
        console.log(`   🎥 Videos: ${result.evidence.testVideos.length}`);
        console.log(
          `   📊 Test Reports: ${result.evidence.testReports.length}`,
        );
      }

      if (result.fixPlan) {
        console.log("\n🔧 Fix Plan:");
        console.log(
          `   📁 Files Modified: ${result.fixPlan.filesToModify.length}`,
        );
        console.log(`   ⚠️  Risk Score: ${result.fixPlan.estimatedRisk}%`);
        console.log(`   🎯 Approach: ${result.fixPlan.approach}`);
      }
    } else if (result.status === "REQUIRES_HUMAN_REVIEW") {
      console.log("\n⏸️  HUMAN REVIEW REQUIRED");
      console.log(
        "The pipeline has prepared a fix plan but needs human approval.",
      );

      if (result.fixPlan) {
        console.log("\n📋 Proposed Fix Plan:");
        console.log(`   🎯 Approach: ${result.fixPlan.approach}`);
        console.log(
          `   📁 Files to modify: ${result.fixPlan.filesToModify.length}`,
        );
        console.log(`   ⚠️  Risk score: ${result.fixPlan.estimatedRisk}%`);

        result.fixPlan.filesToModify.forEach((file, index) => {
          console.log(`\n   📄 File ${index + 1}: ${file.path}`);
          console.log(`      Risk: ${file.riskLevel}`);
          console.log(
            `      Changes: ${file.changes.trim().split("\n")[0]}...`,
          );
        });
      }
    } else if (result.status === "SKIPPED") {
      console.log("\n⏭️  SKIPPED - Bug not suitable for automation");
    } else {
      console.log("\n❌ FAILED - Pipeline encountered an error");
    }

    // Show what would happen in a real scenario
    console.log(`\n${"=".repeat(60)}`);
    console.log("💡 IN A REAL SCENARIO, THIS WOULD:");
    console.log("=".repeat(60));
    console.log("✅ Extract actual bug details from Jira using MCP server");
    console.log("✅ Search your codebase using Claude's Grep/Glob tools");
    console.log("✅ Use Claude's Edit tool to apply actual code changes");
    console.log("✅ Run real Playwright tests using Playwright MCP server");
    console.log("✅ Take actual screenshots and record test videos");
    console.log("✅ Create real GitHub PR using gh CLI");
    console.log("✅ Update Jira ticket with results");

    return result;
  } catch (error) {
    console.error("\n❌ Demo failed with error:", error);
    throw error;
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo()
    .then((result) => {
      console.log("\n🏁 Demo completed successfully!");
      console.log(`Final status: ${result.status}`);
    })
    .catch((error) => {
      console.error("Demo failed:", error);
      process.exit(1);
    });
}

export { runDemo };
