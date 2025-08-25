/**
 * Type definitions for the automated bug-fixing pipeline
 */

export interface JiraBug {
  id: string;
  summary: string;
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  acceptanceCriteria: string[];
  priority: "Low" | "Medium" | "High" | "Critical";
  severity: "Minor" | "Major" | "Critical" | "Blocker";
  components: string[];
  environment: string;
  reporter: string;
  assignee?: string;
  labels: string[];
}

export interface AutomationSuitability {
  isAutomatable: boolean;
  confidence: number; // 0-100
  reason: string;
  riskLevel: "Low" | "Medium" | "High";
  complexity: "Simple" | "Moderate" | "Complex";
  estimatedEffort: number; // hours
}

export interface CodeAnalysis {
  relevantFiles: string[];
  affectedComponents: string[];
  dependencies: string[];
  testFiles: string[];
  patterns: {
    framework: string;
    language: string;
    testingFramework: string;
  };
}

export interface RootCause {
  file: string;
  lineNumber?: number;
  issue: string;
  category: "UI" | "Logic" | "Data" | "Integration" | "Performance";
  confidence: number;
}

export interface FixPlan {
  approach: string;
  filesToModify: Array<{
    path: string;
    changes: string;
    riskLevel: "Low" | "Medium" | "High";
  }>;
  testingStrategy: {
    newTests: string[];
    regressionTests: string[];
    manualTestsRequired: boolean;
  };
  estimatedRisk: number; // 0-100
}

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  screenshot?: string;
  video?: string;
  duration: number;
}

export interface Evidence {
  beforeScreenshots: string[];
  afterScreenshots: string[];
  testVideos: string[];
  testReports: TestResult[];
  performanceMetrics?: {
    before: any;
    after: any;
  };
}

export interface PipelineResult {
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "REQUIRES_HUMAN_REVIEW";
  jiraTicketId: string;
  reason?: string;
  prUrl?: string;
  branchName?: string;
  testResults?: TestResult[];
  evidence?: Evidence;
  fixPlan?: FixPlan;
  executionTime: number;
}

export interface PipelineConfig {
  maxRiskThreshold: number;
  maxComplexityThreshold: string;
  testTimeout: number;
  screenshotPath: string;
  videoPath: string;
  branchPrefix: string;
  requireApprovalFor: ("Medium" | "High" | "Critical")[];
}
