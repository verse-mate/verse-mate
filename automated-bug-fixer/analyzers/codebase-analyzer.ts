/**
 * Codebase analyzer for finding relevant files and identifying root causes
 */

import type { CodeAnalysis, JiraBug, RootCause } from "../core/types";

export class CodebaseAnalyzer {
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  /**
   * Analyze codebase to find files relevant to the bug
   */
  async analyze(bug: JiraBug): Promise<CodeAnalysis> {
    console.log(`🔍 Analyzing codebase for bug: ${bug.summary}`);

    // Extract keywords from bug description
    const keywords = this.extractKeywords(bug);
    console.log(`🔑 Keywords: ${keywords.join(", ")}`);

    // Find relevant files using Claude's Grep tool
    const relevantFiles = await this.findRelevantFiles(
      keywords,
      bug.components,
    );

    // Identify affected components
    const affectedComponents = await this.identifyComponents(relevantFiles);

    // Find dependencies
    const dependencies = await this.findDependencies(relevantFiles);

    // Find test files
    const testFiles = await this.findTestFiles(relevantFiles);

    // Detect patterns
    const patterns = await this.detectPatterns(relevantFiles);

    return {
      relevantFiles,
      affectedComponents,
      dependencies,
      testFiles,
      patterns,
    };
  }

  /**
   * Identify the root cause of the bug
   */
  async identifyRootCause(
    bug: JiraBug,
    analysis: CodeAnalysis,
  ): Promise<RootCause> {
    console.log(`🎯 Identifying root cause for: ${bug.summary}`);

    // For button-related issues, look for button components first
    if (this.isButtonIssue(bug)) {
      return await this.analyzeButtonIssue(bug, analysis);
    }

    // For mobile issues, look for responsive/touch handling
    if (this.isMobileIssue(bug)) {
      return await this.analyzeMobileIssue(bug, analysis);
    }

    // Generic analysis
    return await this.performGenericAnalysis(bug, analysis);
  }

  /**
   * Extract relevant keywords from bug description
   */
  private extractKeywords(bug: JiraBug): string[] {
    const text = `${bug.summary} ${bug.description}`.toLowerCase();
    const keywords: string[] = [];

    // Component keywords
    if (text.includes("button")) keywords.push("button", "btn");
    if (text.includes("form")) keywords.push("form", "input");
    if (text.includes("navigation") || text.includes("nav"))
      keywords.push("nav", "navigation", "menu");
    if (text.includes("volunteer")) keywords.push("volunteer", "team");
    if (text.includes("mobile")) keywords.push("mobile", "responsive", "touch");

    // Extract specific page names
    const pageMatches = text.match(
      /(volunteer|localization|spiritual|technical)[-\s]*(team|support|page)/gi,
    );
    if (pageMatches) {
      keywords.push(
        ...pageMatches.map((m) => m.toLowerCase().replace(/[-\s]+/g, "-")),
      );
    }

    // Add component names from Jira
    keywords.push(...bug.components.map((c) => c.toLowerCase()));

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Find files relevant to the bug using search tools
   */
  private async findRelevantFiles(
    keywords: string[],
    components: string[],
  ): Promise<string[]> {
    const files = new Set<string>();

    // TODO: Use Claude's Grep tool to search for keywords
    // For now, simulate the search based on our VerseMate structure

    // Search for volunteer-related files
    if (keywords.some((k) => k.includes("volunteer"))) {
      files.add("apps/website/src/pages/volunteer.tsx");
      files.add("apps/website/src/pages/localization-team.tsx");
      files.add("apps/website/src/pages/spiritual-support-team.tsx");
      files.add("apps/website/src/pages/technical-support-team.tsx");
    }

    // Search for button-related components
    if (keywords.some((k) => k.includes("button") || k.includes("btn"))) {
      files.add("apps/website/src/components/Button.tsx");
      // Add pages that contain buttons
      files.add("apps/website/src/pages/volunteer.tsx");
    }

    // Search for mobile/responsive issues
    if (
      keywords.some((k) => k.includes("mobile") || k.includes("responsive"))
    ) {
      // Add CSS/style files
      files.add("apps/website/src/styles/globals.css");
      files.add("apps/website/tailwind.config.js");
    }

    return Array.from(files);
  }

  /**
   * Identify components from file paths
   */
  private async identifyComponents(files: string[]): Promise<string[]> {
    const components = new Set<string>();

    files.forEach((file) => {
      if (file.includes("/pages/")) {
        const pageName = file.split("/pages/")[1].replace(".tsx", "");
        components.add(`page:${pageName}`);
      }
      if (file.includes("/components/")) {
        const componentName = file.split("/components/")[1].replace(".tsx", "");
        components.add(`component:${componentName}`);
      }
    });

    return Array.from(components);
  }

  /**
   * Find dependencies for the relevant files
   */
  private async findDependencies(files: string[]): Promise<string[]> {
    const dependencies = new Set<string>();

    // TODO: Parse import statements from files to find dependencies
    // For now, add common dependencies for React/Next.js
    dependencies.add("react");
    dependencies.add("next/link");

    if (files.some((f) => f.includes("volunteer"))) {
      dependencies.add("@/lib/navigation");
    }

    return Array.from(dependencies);
  }

  /**
   * Find test files related to the bug
   */
  private async findTestFiles(files: string[]): Promise<string[]> {
    const testFiles: string[] = [];

    // TODO: Search for corresponding test files
    // Look for .test.tsx, .spec.tsx files
    // Check for e2e test files in playwright/tests

    files.forEach((file) => {
      const testFile = file.replace(".tsx", ".test.tsx");
      // In a real implementation, we'd check if these files exist
      testFiles.push(testFile);

      // Check for e2e tests
      if (file.includes("/pages/")) {
        const pageName = file.split("/pages/")[1].replace(".tsx", "");
        testFiles.push(`playwright/tests/${pageName}.spec.ts`);
      }
    });

    return testFiles;
  }

  /**
   * Detect patterns in the codebase
   */
  private async detectPatterns(files: string[]): Promise<{
    framework: string;
    language: string;
    testingFramework: string;
  }> {
    // TODO: Analyze files to detect patterns
    // For now, return known patterns for VerseMate

    return {
      framework: "Next.js",
      language: "TypeScript",
      testingFramework: "Playwright",
    };
  }

  /**
   * Check if this is a button-related issue
   */
  private isButtonIssue(bug: JiraBug): boolean {
    const text = `${bug.summary} ${bug.description}`.toLowerCase();
    return (
      text.includes("button") || text.includes("click") || text.includes("tap")
    );
  }

  /**
   * Check if this is a mobile-related issue
   */
  private isMobileIssue(bug: JiraBug): boolean {
    const text = `${bug.summary} ${bug.description}`.toLowerCase();
    return (
      text.includes("mobile") ||
      text.includes("responsive") ||
      text.includes("touch") ||
      bug.labels.includes("mobile")
    );
  }

  /**
   * Analyze button-related issues
   */
  private async analyzeButtonIssue(
    bug: JiraBug,
    analysis: CodeAnalysis,
  ): Promise<RootCause> {
    // Look for button implementations in relevant files
    const buttonFiles = analysis.relevantFiles.filter(
      (f) => f.includes("volunteer") || f.includes("Button"),
    );

    if (buttonFiles.length > 0) {
      // TODO: Read the file content and analyze button implementation
      // Look for potential issues:
      // - Missing cursor: pointer
      // - No touch-action CSS
      // - Missing touch event handlers
      // - Wrong button type

      return {
        file: buttonFiles[0],
        lineNumber: undefined, // TODO: Find specific line
        issue:
          "Button likely missing proper touch event handling or CSS for mobile devices",
        category: "UI",
        confidence: 85,
      };
    }

    return this.createGenericRootCause(bug, analysis);
  }

  /**
   * Analyze mobile-specific issues
   */
  private async analyzeMobileIssue(
    bug: JiraBug,
    analysis: CodeAnalysis,
  ): Promise<RootCause> {
    // Look for CSS/responsive issues
    const styleFiles = analysis.relevantFiles.filter(
      (f) => f.includes(".css") || f.includes("volunteer"),
    );

    if (styleFiles.length > 0) {
      return {
        file: styleFiles[0],
        issue:
          "Missing touch-friendly CSS properties or responsive design issues",
        category: "UI",
        confidence: 80,
      };
    }

    return this.createGenericRootCause(bug, analysis);
  }

  /**
   * Perform generic analysis when specific patterns don't match
   */
  private async performGenericAnalysis(
    bug: JiraBug,
    analysis: CodeAnalysis,
  ): Promise<RootCause> {
    return this.createGenericRootCause(bug, analysis);
  }

  /**
   * Create a generic root cause when specific analysis isn't possible
   */
  private createGenericRootCause(
    bug: JiraBug,
    analysis: CodeAnalysis,
  ): RootCause {
    const primaryFile = analysis.relevantFiles[0] || "unknown";

    return {
      file: primaryFile,
      issue: `Issue likely related to ${bug.summary.toLowerCase()}`,
      category: this.categorizeIssue(bug),
      confidence: 60,
    };
  }

  /**
   * Categorize the issue based on bug description
   */
  private categorizeIssue(
    bug: JiraBug,
  ): "UI" | "Logic" | "Data" | "Integration" | "Performance" {
    const text = `${bug.summary} ${bug.description}`.toLowerCase();

    if (
      text.includes("button") ||
      text.includes("click") ||
      text.includes("display") ||
      text.includes("ui")
    ) {
      return "UI";
    }
    if (
      text.includes("data") ||
      text.includes("database") ||
      text.includes("api")
    ) {
      return "Data";
    }
    if (
      text.includes("slow") ||
      text.includes("performance") ||
      text.includes("speed")
    ) {
      return "Performance";
    }
    if (text.includes("integration") || text.includes("third-party")) {
      return "Integration";
    }

    return "Logic";
  }
}
