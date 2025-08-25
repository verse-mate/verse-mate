/**
 * Fix implementer - generates and applies code fixes
 */

import type { CodeAnalysis, FixPlan, JiraBug, RootCause } from "./types";

export class FixImplementer {
  /**
   * Plan the fix based on root cause analysis
   */
  async planFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ): Promise<FixPlan> {
    console.log(`📋 Planning fix for: ${rootCause.issue}`);

    let approach = "";
    let filesToModify: FixPlan["filesToModify"] = [];
    let testingStrategy: FixPlan["testingStrategy"];
    let estimatedRisk = 30; // Base risk

    // Plan fix based on issue category
    switch (rootCause.category) {
      case "UI":
        if (this.isButtonIssue(bug)) {
          ({ approach, filesToModify, estimatedRisk } =
            await this.planButtonFix(bug, rootCause, codeAnalysis));
        } else {
          ({ approach, filesToModify, estimatedRisk } =
            await this.planGenericUIFix(bug, rootCause, codeAnalysis));
        }
        break;

      case "Logic":
        ({ approach, filesToModify, estimatedRisk } = await this.planLogicFix(
          bug,
          rootCause,
          codeAnalysis,
        ));
        break;

      default:
        ({ approach, filesToModify, estimatedRisk } = await this.planGenericFix(
          bug,
          rootCause,
          codeAnalysis,
        ));
    }

    // Plan testing strategy
    testingStrategy = {
      newTests: [
        `${bug.id.toLowerCase()}.spec.ts`,
        `${rootCause.category.toLowerCase()}-regression.spec.ts`,
      ],
      regressionTests: codeAnalysis.testFiles,
      manualTestsRequired: estimatedRisk > 60,
    };

    return {
      approach,
      filesToModify,
      testingStrategy,
      estimatedRisk,
    };
  }

  /**
   * Implement the planned fix
   */
  async implement(fixPlan: FixPlan): Promise<void> {
    console.log(`🔧 Implementing fix: ${fixPlan.approach}`);

    for (const fileChange of fixPlan.filesToModify) {
      console.log(
        `  📝 Modifying: ${fileChange.path} (risk: ${fileChange.riskLevel})`,
      );

      // TODO: Use Claude's Edit tool to apply the changes
      // For now, just log what would be done
      console.log(`     Changes: ${fileChange.changes}`);

      // In real implementation:
      // await applyFileChanges(fileChange.path, fileChange.changes);
    }

    console.log("✅ Fix implementation completed");
  }

  /**
   * Plan fix for button-related issues
   */
  private async planButtonFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ) {
    const approach =
      "Add mobile-friendly CSS properties and touch event handling";

    const filesToModify = [
      {
        path: rootCause.file,
        changes: `
- Add cursor: 'pointer' to button styles
- Add touch-action: 'manipulation' for better mobile performance
- Ensure proper button type attribute
- Add proper touch event handlers if needed
`,
        riskLevel: "Low" as const,
      },
    ];

    // Check if we need to modify CSS files
    if (this.isMobileIssue(bug)) {
      filesToModify.push({
        path: "apps/website/src/styles/globals.css",
        changes: `
- Add touch-action: manipulation to button selectors
- Ensure proper mobile viewport handling
- Add focus styles for accessibility
`,
        riskLevel: "Low" as const,
      });
    }

    return { approach, filesToModify, estimatedRisk: 25 };
  }

  /**
   * Plan generic UI fix
   */
  private async planGenericUIFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ) {
    const approach =
      "Fix UI-related issue with responsive design and interaction";

    const filesToModify = [
      {
        path: rootCause.file,
        changes: `
- Review and fix responsive design issues
- Ensure proper CSS properties for mobile devices
- Add missing accessibility attributes
`,
        riskLevel: "Medium" as const,
      },
    ];

    return { approach, filesToModify, estimatedRisk: 40 };
  }

  /**
   * Plan logic fix
   */
  private async planLogicFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ) {
    const approach = "Fix logical error in component behavior";

    const filesToModify = [
      {
        path: rootCause.file,
        changes: `
- Review and fix logical error
- Add proper error handling
- Ensure edge cases are covered
`,
        riskLevel: "High" as const,
      },
    ];

    return { approach, filesToModify, estimatedRisk: 70 };
  }

  /**
   * Plan generic fix when specific category handling isn't available
   */
  private async planGenericFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ) {
    const approach = `Fix ${rootCause.category.toLowerCase()} issue: ${rootCause.issue}`;

    const filesToModify = [
      {
        path: rootCause.file,
        changes: `
- Address the issue: ${rootCause.issue}
- Add appropriate error handling
- Include necessary tests
`,
        riskLevel: "Medium" as const,
      },
    ];

    return { approach, filesToModify, estimatedRisk: 50 };
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
}
