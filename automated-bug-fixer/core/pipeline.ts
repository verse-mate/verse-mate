/**
 * Main automated bug-fixing pipeline orchestrator
 */

import { CodebaseAnalyzer } from "../analyzers/codebase-analyzer";
import { JiraAnalyzer } from "../analyzers/jira-analyzer";
import { RiskAssessment } from "../analyzers/risk-assessment";
import { PlaywrightTester } from "../testers/playwright-tester";
import { EvidenceCollector } from "../utils/evidence-collector";
import { GitManager } from "../utils/git-manager";
import { PRCreator } from "../utils/pr-creator";
import { FixImplementer } from "./fix-implementer";
import type {
  AutomationSuitability,
  CodeAnalysis,
  Evidence,
  FixPlan,
  JiraBug,
  PipelineConfig,
  PipelineResult,
  RootCause,
} from "./types";

export class AutomatedBugFixer {
  private config: PipelineConfig;
  private jiraAnalyzer: JiraAnalyzer;
  private codebaseAnalyzer: CodebaseAnalyzer;
  private riskAssessment: RiskAssessment;
  private fixImplementer: FixImplementer;
  private playwrightTester: PlaywrightTester;
  private evidenceCollector: EvidenceCollector;
  private gitManager: GitManager;
  private prCreator: PRCreator;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.jiraAnalyzer = new JiraAnalyzer();
    this.codebaseAnalyzer = new CodebaseAnalyzer();
    this.riskAssessment = new RiskAssessment();
    this.fixImplementer = new FixImplementer();
    this.playwrightTester = new PlaywrightTester(config);
    this.evidenceCollector = new EvidenceCollector(config);
    this.gitManager = new GitManager(config);
    this.prCreator = new PRCreator();
  }

  /**
   * Main pipeline execution method
   */
  async fixBug(jiraTicketId: string): Promise<PipelineResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting automated bug fix for ${jiraTicketId}`);

      // Phase 1: Extract bug details from Jira
      const bugDetails = await this.extractBugFromJira(jiraTicketId);
      console.log(`📝 Extracted bug details: ${bugDetails.summary}`);

      // Phase 2: Assess automation suitability
      const suitability = await this.assessAutomationSuitability(bugDetails);
      if (!suitability.isAutomatable) {
        return {
          status: "SKIPPED",
          jiraTicketId,
          reason: suitability.reason,
          executionTime: Date.now() - startTime,
        };
      }
      console.log(
        `✅ Bug is automatable (confidence: ${suitability.confidence}%)`,
      );

      // Phase 3: Analyze codebase
      const codeAnalysis = await this.analyzeCodebase(bugDetails);
      console.log(
        `🔍 Found ${codeAnalysis.relevantFiles.length} relevant files`,
      );

      // Phase 4: Identify root cause
      const rootCause = await this.identifyRootCause(bugDetails, codeAnalysis);
      console.log(`🎯 Root cause identified in ${rootCause.file}`);

      // Phase 5: Plan the fix
      const fixPlan = await this.planFix(bugDetails, rootCause, codeAnalysis);
      console.log(`📋 Fix plan created (risk: ${fixPlan.estimatedRisk}%)`);

      // Phase 6: Risk assessment
      const riskCheck = await this.assessRisk(fixPlan, suitability);
      if (riskCheck.requiresHumanReview) {
        return {
          status: "REQUIRES_HUMAN_REVIEW",
          jiraTicketId,
          reason: riskCheck.reason,
          fixPlan,
          executionTime: Date.now() - startTime,
        };
      }

      // Phase 7: Create branch and implement fix
      const branchName =
        await this.gitManager.createFeatureBranch(jiraTicketId);
      console.log(`🌿 Created branch: ${branchName}`);

      await this.implementFix(fixPlan);
      console.log("🔧 Fix implemented");

      // Phase 8: Run automated tests
      const testResults = await this.runAutomatedTests(bugDetails, fixPlan);
      if (!testResults.every((result) => result.passed)) {
        await this.gitManager.rollback(branchName);
        return {
          status: "FAILED",
          jiraTicketId,
          reason: "Tests failed after fix implementation",
          testResults,
          branchName,
          executionTime: Date.now() - startTime,
        };
      }
      console.log("✅ All tests passed");

      // Phase 9: Collect evidence
      const evidence = await this.collectEvidence(bugDetails, testResults);
      console.log("📸 Evidence collected");

      // Phase 10: Create PR and update Jira
      const prUrl = await this.createPullRequest(
        jiraTicketId,
        bugDetails,
        fixPlan,
        evidence,
      );
      await this.updateJiraTicket(jiraTicketId, prUrl, evidence);
      console.log(`🎉 PR created: ${prUrl}`);

      return {
        status: "SUCCESS",
        jiraTicketId,
        prUrl,
        branchName,
        testResults,
        evidence,
        fixPlan,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`❌ Pipeline failed for ${jiraTicketId}:`, error);
      return {
        status: "FAILED",
        jiraTicketId,
        reason: error instanceof Error ? error.message : "Unknown error",
        executionTime: Date.now() - startTime,
      };
    }
  }

  // Phase implementations

  private async extractBugFromJira(ticketId: string): Promise<JiraBug> {
    return await this.jiraAnalyzer.extractBugDetails(ticketId);
  }

  private async assessAutomationSuitability(
    bug: JiraBug,
  ): Promise<AutomationSuitability> {
    return await this.jiraAnalyzer.assessAutomationSuitability(bug);
  }

  private async analyzeCodebase(bug: JiraBug): Promise<CodeAnalysis> {
    return await this.codebaseAnalyzer.analyze(bug);
  }

  private async identifyRootCause(
    bug: JiraBug,
    codeAnalysis: CodeAnalysis,
  ): Promise<RootCause> {
    return await this.codebaseAnalyzer.identifyRootCause(bug, codeAnalysis);
  }

  private async planFix(
    bug: JiraBug,
    rootCause: RootCause,
    codeAnalysis: CodeAnalysis,
  ): Promise<FixPlan> {
    return await this.fixImplementer.planFix(bug, rootCause, codeAnalysis);
  }

  private async assessRisk(
    fixPlan: FixPlan,
    suitability: AutomationSuitability,
  ): Promise<{ requiresHumanReview: boolean; reason?: string }> {
    const risk = await this.riskAssessment.assess(fixPlan, suitability);

    if (risk.score > this.config.maxRiskThreshold) {
      return {
        requiresHumanReview: true,
        reason: `Risk score (${risk.score}) exceeds threshold (${this.config.maxRiskThreshold})`,
      };
    }

    if (
      suitability.riskLevel !== "Low" &&
      this.config.requireApprovalFor.includes(
        suitability.riskLevel as "Medium" | "High" | "Critical",
      )
    ) {
      return {
        requiresHumanReview: true,
        reason: `${suitability.riskLevel} risk level requires human approval`,
      };
    }

    return { requiresHumanReview: false };
  }

  private async implementFix(fixPlan: FixPlan): Promise<void> {
    return await this.fixImplementer.implement(fixPlan);
  }

  private async runAutomatedTests(
    bug: JiraBug,
    fixPlan: FixPlan,
  ): Promise<any[]> {
    return await this.playwrightTester.runTests(bug, fixPlan);
  }

  private async collectEvidence(
    bug: JiraBug,
    testResults: any[],
  ): Promise<Evidence> {
    return await this.evidenceCollector.collect(bug, testResults);
  }

  private async createPullRequest(
    ticketId: string,
    bug: JiraBug,
    fixPlan: FixPlan,
    evidence: Evidence,
  ): Promise<string> {
    return await this.prCreator.create(ticketId, bug, fixPlan, evidence);
  }

  private async updateJiraTicket(
    ticketId: string,
    prUrl: string,
    evidence: Evidence,
  ): Promise<void> {
    return await this.jiraAnalyzer.updateTicket(ticketId, prUrl, evidence);
  }
}
