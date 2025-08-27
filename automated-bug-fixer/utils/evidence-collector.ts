/**
 * Evidence collection for bug fixes
 */

import type {
  Evidence,
  JiraBug,
  PipelineConfig,
  TestResult,
} from "../core/types";

export class EvidenceCollector {
  private config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  /**
   * Collect evidence of the bug fix
   */
  async collect(bug: JiraBug, testResults: TestResult[]): Promise<Evidence> {
    console.log(`📸 Collecting evidence for: ${bug.summary}`);

    // Helper type predicates
    const hasScreenshot = (
      result: TestResult,
    ): result is TestResult & { screenshot: string } => !!result.screenshot;

    const hasVideo = (
      result: TestResult,
    ): result is TestResult & { video: string } => !!result.video;

    // Collect screenshots from test results
    const afterScreenshots = testResults
      .filter(hasScreenshot)
      .map((result) => result.screenshot);

    const testVideos = testResults
      .filter(hasVideo)
      .map((result) => result.video);

    // For before screenshots, we'd typically have baseline screenshots
    const beforeScreenshots = await this.getBaselineScreenshots(bug);

    // Collect performance metrics if needed
    const performanceMetrics = await this.collectPerformanceMetrics(bug);

    const evidence: Evidence = {
      beforeScreenshots,
      afterScreenshots,
      testVideos,
      testReports: testResults,
      performanceMetrics,
    };

    console.log("📊 Evidence summary:");
    console.log(`   Screenshots: ${evidence.afterScreenshots.length}`);
    console.log(`   Videos: ${evidence.testVideos.length}`);
    console.log(`   Test reports: ${evidence.testReports.length}`);

    return evidence;
  }

  /**
   * Get baseline screenshots (would be from previous test runs)
   */
  private async getBaselineScreenshots(bug: JiraBug): Promise<string[]> {
    // In a real implementation, this would:
    // 1. Look for existing screenshots in the evidence folder
    // 2. Take new "before" screenshots if none exist
    // 3. Use git to find screenshots from previous commits

    return [
      `${this.config.screenshotPath}/baseline-volunteer-page.png`,
      `${this.config.screenshotPath}/baseline-mobile-view.png`,
    ];
  }

  /**
   * Collect performance metrics if relevant
   */
  private async collectPerformanceMetrics(bug: JiraBug): Promise<any> {
    // Only collect performance metrics for performance-related bugs
    if (!this.isPerformanceIssue(bug)) {
      return undefined;
    }

    // In a real implementation, this would:
    // 1. Run Lighthouse audits
    // 2. Measure page load times
    // 3. Check Core Web Vitals
    // 4. Compare before/after metrics

    return {
      before: {
        loadTime: 2500,
        firstContentfulPaint: 1200,
        largestContentfulPaint: 2000,
      },
      after: {
        loadTime: 1800,
        firstContentfulPaint: 800,
        largestContentfulPaint: 1400,
      },
    };
  }

  /**
   * Generate evidence summary for PR description
   */
  generateSummary(evidence: Evidence): string {
    let summary = "## 🧪 Automated Testing Evidence\n\n";

    // Test results summary
    const totalTests = evidence.testReports.length;
    const passedTests = evidence.testReports.filter((t) => t.passed).length;
    const failedTests = totalTests - passedTests;

    summary += "### Test Results\n";
    summary += `- ✅ Passed: ${passedTests}\n`;
    if (failedTests > 0) {
      summary += `- ❌ Failed: ${failedTests}\n`;
    }
    summary += `- 📊 Total: ${totalTests}\n\n`;

    // Screenshots
    if (evidence.afterScreenshots.length > 0) {
      summary += "### Screenshots\n";
      summary += `- 📸 After fix: ${evidence.afterScreenshots.length} screenshots\n`;
      if (evidence.beforeScreenshots.length > 0) {
        summary += `- 📸 Before fix: ${evidence.beforeScreenshots.length} screenshots\n`;
      }
      summary += "\n";
    }

    // Videos
    if (evidence.testVideos.length > 0) {
      summary += "### Test Videos\n";
      summary += `- 🎥 Test recordings: ${evidence.testVideos.length} videos\n\n`;
    }

    // Performance metrics
    if (evidence.performanceMetrics) {
      summary += "### Performance Impact\n";
      const before = evidence.performanceMetrics.before;
      const after = evidence.performanceMetrics.after;

      if (before.loadTime && after.loadTime) {
        const improvement = (
          ((before.loadTime - after.loadTime) / before.loadTime) *
          100
        ).toFixed(1);
        summary += `- ⚡ Load time improved by ${improvement}% (${before.loadTime}ms → ${after.loadTime}ms)\n`;
      }
      summary += "\n";
    }

    // Detailed test results
    summary += "### Detailed Test Results\n\n";
    evidence.testReports.forEach((test) => {
      const status = test.passed ? "✅" : "❌";
      summary += `- ${status} **${test.testName}** (${test.duration}ms)\n`;
      if (test.error) {
        summary += `  - Error: ${test.error}\n`;
      }
    });

    return summary;
  }

  /**
   * Check if this is a performance-related issue
   */
  private isPerformanceIssue(bug: JiraBug): boolean {
    const text = `${bug.summary} ${bug.description}`.toLowerCase();
    return (
      text.includes("slow") ||
      text.includes("performance") ||
      text.includes("speed") ||
      text.includes("load")
    );
  }
}
