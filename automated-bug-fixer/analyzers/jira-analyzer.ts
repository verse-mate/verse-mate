/**
 * Jira analyzer for extracting bug details and assessing automation suitability
 */

import type { AutomationSuitability, Evidence, JiraBug } from "../core/types";

export class JiraAnalyzer {
  private jiraBaseUrl: string;
  private authToken: string;

  constructor() {
    this.jiraBaseUrl = process.env.JIRA_BASE_URL || "";
    this.authToken = process.env.JIRA_AUTH_TOKEN || "";
  }

  /**
   * Extract bug details from Jira using MCP server
   */
  async extractBugDetails(ticketId: string): Promise<JiraBug> {
    // TODO: Use Jira MCP server when available
    // For now, we'll simulate the extraction

    // In real implementation, this would use:
    // const jiraData = await jiraMcp.getIssue(ticketId);

    // Simulated bug data for testing
    const mockBug: JiraBug = {
      id: ticketId,
      summary: "Button not responding on mobile devices",
      description:
        "The 'I'm Ready To Serve' button on the volunteer page doesn't respond when tapped on mobile devices (iOS Safari and Android Chrome)",
      stepsToReproduce: [
        "1. Open volunteer page on mobile device",
        "2. Scroll to any team section",
        "3. Tap on 'I'm Ready To Serve' button",
        "4. Observe no response",
      ],
      expectedBehavior:
        "Button should navigate to the respective team page when tapped",
      actualBehavior: "Button does not respond to touch events on mobile",
      acceptanceCriteria: [
        "Button responds to touch on iOS Safari",
        "Button responds to touch on Android Chrome",
        "Navigation works correctly after button press",
        "Button provides visual feedback when pressed",
      ],
      priority: "High",
      severity: "Major",
      components: ["website", "volunteer-pages"],
      environment: "Production",
      reporter: "user@example.com",
      labels: ["mobile", "ui", "button"],
    };

    return this.parseBugDetails(mockBug);
  }

  /**
   * Assess whether a bug is suitable for automation
   */
  async assessAutomationSuitability(
    bug: JiraBug,
  ): Promise<AutomationSuitability> {
    let score = 0;
    const reasons: string[] = [];

    // Check for clear reproduction steps
    if (bug.stepsToReproduce && bug.stepsToReproduce.length >= 3) {
      score += 30;
    } else {
      reasons.push("Insufficient reproduction steps");
    }

    // Check for clear acceptance criteria
    if (bug.acceptanceCriteria && bug.acceptanceCriteria.length >= 2) {
      score += 25;
    } else {
      reasons.push("Unclear acceptance criteria");
    }

    // Check bug category (UI bugs are more automatable)
    const isUIBug = this.isUIRelated(bug);
    if (isUIBug) {
      score += 25;
    } else {
      reasons.push("Non-UI bugs are more complex to automate");
    }

    // Check for mobile/responsive issues (good for Playwright testing)
    const isMobileIssue =
      bug.labels.includes("mobile") ||
      bug.description.toLowerCase().includes("mobile");
    if (isMobileIssue) {
      score += 10;
    }

    // Check severity (avoid critical production issues)
    if (bug.severity === "Critical" || bug.severity === "Blocker") {
      score -= 20;
      reasons.push("Critical issues require human oversight");
    } else {
      score += 10;
    }

    // Determine automation suitability
    const isAutomatable = score >= 70;
    const confidence = Math.min(score, 100);

    let complexity: "Simple" | "Moderate" | "Complex" = "Moderate";
    if (isUIBug && isMobileIssue && bug.stepsToReproduce.length <= 5) {
      complexity = "Simple";
    } else if (bug.components.length > 2 || bug.severity === "Critical") {
      complexity = "Complex";
    }

    let riskLevel: "Low" | "Medium" | "High" = "Medium";
    if (complexity === "Simple" && bug.severity !== "Critical") {
      riskLevel = "Low";
    } else if (complexity === "Complex" || bug.severity === "Critical") {
      riskLevel = "High";
    }

    return {
      isAutomatable,
      confidence,
      reason: isAutomatable
        ? "Bug has clear steps and UI focus"
        : reasons.join("; "),
      riskLevel,
      complexity,
      estimatedEffort: this.estimateEffort(complexity, bug),
    };
  }

  /**
   * Update Jira ticket with PR and evidence links
   */
  async updateTicket(
    ticketId: string,
    prUrl: string,
    evidence: Evidence,
  ): Promise<void> {
    // TODO: Use Jira MCP server to update ticket
    // This would add comments with:
    // - Link to PR
    // - Test evidence
    // - Screenshots/videos
    // - Mark as "In Review" status

    console.log(`📝 Would update Jira ticket ${ticketId}:`);
    console.log(`   - PR: ${prUrl}`);
    console.log(`   - Evidence: ${evidence.testReports.length} test reports`);
    console.log(`   - Screenshots: ${evidence.afterScreenshots.length}`);
  }

  /**
   * Parse and normalize bug details from Jira response
   */
  private parseBugDetails(rawBug: any): JiraBug {
    // TODO: Parse real Jira API response structure
    // This would handle Jira's complex JSON structure and extract relevant fields

    return rawBug;
  }

  /**
   * Check if bug is UI-related
   */
  private isUIRelated(bug: JiraBug): boolean {
    const uiKeywords = [
      "button",
      "click",
      "tap",
      "ui",
      "interface",
      "form",
      "input",
      "display",
      "layout",
      "responsive",
    ];
    const text = `${bug.summary} ${bug.description}`.toLowerCase();

    return uiKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Estimate effort required for fix
   */
  private estimateEffort(complexity: string, bug: JiraBug): number {
    const baseHours = {
      Simple: 2,
      Moderate: 4,
      Complex: 8,
    };

    let hours = baseHours[complexity as keyof typeof baseHours] || 4;

    // Add time for mobile testing
    if (bug.labels.includes("mobile")) {
      hours += 1;
    }

    // Add time for multiple components
    if (bug.components.length > 1) {
      hours += 1;
    }

    return hours;
  }
}
