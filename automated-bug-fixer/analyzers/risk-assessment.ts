/**
 * Risk assessment for automated fixes
 */

import type { AutomationSuitability, FixPlan } from "../core/types";

export interface RiskScore {
  score: number; // 0-100
  factors: string[];
  recommendation: "PROCEED" | "REVIEW" | "REJECT";
}

export class RiskAssessment {
  /**
   * Assess the risk of implementing a fix plan
   */
  async assess(
    fixPlan: FixPlan,
    suitability: AutomationSuitability,
  ): Promise<RiskScore> {
    let score = 0;
    const factors: string[] = [];

    // Base risk from fix plan
    score += fixPlan.estimatedRisk * 0.4;

    // Risk based on number of files to modify
    const fileCount = fixPlan.filesToModify.length;
    if (fileCount > 3) {
      score += 20;
      factors.push(`Modifying ${fileCount} files increases risk`);
    } else if (fileCount > 1) {
      score += 10;
      factors.push(`Modifying ${fileCount} files`);
    }

    // Risk based on file types
    for (const file of fixPlan.filesToModify) {
      if (file.riskLevel === "High") {
        score += 25;
        factors.push(`High-risk file: ${file.path}`);
      } else if (file.riskLevel === "Medium") {
        score += 15;
        factors.push(`Medium-risk file: ${file.path}`);
      }

      // Critical files
      if (this.isCriticalFile(file.path)) {
        score += 20;
        factors.push(`Critical system file: ${file.path}`);
      }
    }

    // Risk based on automation suitability
    if (suitability.confidence < 70) {
      score += 20;
      factors.push(`Low automation confidence: ${suitability.confidence}%`);
    }

    if (suitability.complexity === "Complex") {
      score += 25;
      factors.push("Complex issue increases risk");
    } else if (suitability.complexity === "Moderate") {
      score += 10;
      factors.push("Moderate complexity");
    }

    // Risk based on testing requirements
    if (fixPlan.testingStrategy.manualTestsRequired) {
      score += 15;
      factors.push("Manual testing required");
    }

    if (fixPlan.testingStrategy.regressionTests.length === 0) {
      score += 20;
      factors.push("No existing regression tests");
    }

    // Cap score at 100
    score = Math.min(score, 100);

    // Determine recommendation
    let recommendation: RiskScore["recommendation"] = "PROCEED";
    if (score > 75) {
      recommendation = "REJECT";
    } else if (score > 50) {
      recommendation = "REVIEW";
    }

    return {
      score: Math.round(score),
      factors,
      recommendation,
    };
  }

  /**
   * Check if a file is critical to system operation
   */
  private isCriticalFile(filePath: string): boolean {
    const criticalPatterns = [
      "/package.json",
      "/next.config",
      "/config/",
      "/lib/auth",
      "/lib/database",
      "/_app.tsx",
      "/_document.tsx",
    ];

    return criticalPatterns.some((pattern) => filePath.includes(pattern));
  }
}
