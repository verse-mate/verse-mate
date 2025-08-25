# Automated Bug-Fixing Pipeline

An intelligent system that automatically extracts bug details from Jira, analyzes codebases, implements fixes, runs comprehensive tests, and creates pull requests with evidence.

## 🎯 Overview

This pipeline automates the entire bug-fixing workflow:

1. **Extract** bug details from Jira using MCP server
2. **Analyze** codebase to find relevant files and root causes  
3. **Plan** appropriate fixes with risk assessment
4. **Implement** code changes using Claude's editing tools
5. **Test** fixes using Playwright automation
6. **Collect** evidence (screenshots, videos, test reports)
7. **Create** GitHub PR with comprehensive documentation
8. **Update** Jira ticket with results

## 🏗️ Architecture

```
automated-bug-fixer/
├── core/                   # Core pipeline logic
│   ├── types.ts           # TypeScript definitions
│   ├── pipeline.ts        # Main orchestrator
│   └── fix-implementer.ts # Code fix implementation
├── analyzers/             # Analysis components
│   ├── jira-analyzer.ts   # Jira integration & suitability assessment
│   ├── codebase-analyzer.ts # Code discovery & root cause analysis
│   └── risk-assessment.ts # Fix risk evaluation
├── testers/               # Testing components
│   └── playwright-tester.ts # Automated testing with Playwright
├── utils/                 # Utility components
│   ├── evidence-collector.ts # Evidence gathering
│   ├── git-manager.ts     # Git operations
│   └── pr-creator.ts      # Pull request creation
├── examples/              # Example usage
│   └── demo.ts           # Demo script
├── cli.ts                # Command line interface
└── README.md             # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Access to Jira MCP server
- Playwright MCP server configured
- GitHub CLI (`gh`) installed
- Git repository with appropriate permissions

### Installation

```bash
# Clone and install dependencies
git clone <repo>
cd automated-bug-fixer
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Jira and GitHub credentials
```

### Basic Usage

```bash
# Fix a specific bug
./cli.ts VM-123

# Run demo mode
npm run demo
```

### Programmatic Usage

```typescript
import { AutomatedBugFixer } from './core/pipeline';

const config = {
  maxRiskThreshold: 75,
  requireApprovalFor: ['High', 'Critical'],
  // ... other config
};

const bugFixer = new AutomatedBugFixer(config);
const result = await bugFixer.fixBug('JIRA-123');

console.log(`Status: ${result.status}`);
console.log(`PR: ${result.prUrl}`);
```

## ⚙️ Configuration

```typescript
interface PipelineConfig {
  maxRiskThreshold: number;        // 0-100, fixes above this need approval
  maxComplexityThreshold: string;  // 'Simple' | 'Moderate' | 'Complex'
  testTimeout: number;             // Test timeout in milliseconds
  screenshotPath: string;          // Where to store screenshots
  videoPath: string;               // Where to store test videos
  branchPrefix: string;            // Git branch naming prefix
  requireApprovalFor: string[];    // Risk levels requiring approval
}
```

## 🧪 Testing Strategy

The pipeline implements comprehensive testing:

### Test Generation
- **Bug-specific tests**: Generated from Jira reproduction steps
- **Regression tests**: Ensure fix doesn't break existing functionality
- **Mobile tests**: Cross-device compatibility testing
- **Performance tests**: For performance-related bugs

### Test Execution
```typescript
// Example generated test
test('button should be clickable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/volunteer');
  
  const button = page.locator('button:has-text("I\'m Ready To Serve")');
  await expect(button).toBeVisible();
  await button.tap();
  await expect(page).toHaveURL(/\/.*-team$/);
});
```

### Evidence Collection
- **Before/after screenshots** for visual comparison
- **Test execution videos** for debugging
- **Performance metrics** for performance issues
- **Detailed test reports** with timing and results

## 🎯 Automation Suitability

The pipeline automatically assesses whether bugs are suitable for automation:

### ✅ Good Candidates
- **UI bugs** with clear reproduction steps
- **Mobile responsiveness** issues
- **Button/form interaction** problems
- **Clear acceptance criteria** defined
- **Non-critical severity** levels

### ❌ Poor Candidates
- **Vague descriptions** without clear steps
- **Security vulnerabilities** requiring careful review
- **Complex business logic** changes
- **Database migration** issues
- **Third-party integration** problems

## 🛡️ Safety Mechanisms

### Risk Assessment
```typescript
// Automatic risk scoring based on:
- Number of files modified
- File criticality (config, auth, database files)
- Complexity of changes
- Test coverage availability
- Bug severity level
```

### Approval Gates
- **Low risk** (0-50%): Auto-proceed
- **Medium risk** (51-75%): Human review recommended  
- **High risk** (76-100%): Human approval required

### Rollback Capability
- Automatic rollback if tests fail
- Git branch isolation for safe experimentation
- Comprehensive logging for debugging

## 📊 Pipeline Results

### Success Flow
```
🚀 Starting automated bug fix for VM-123
📝 Extracted bug details: Button not responding on mobile
✅ Bug is automatable (confidence: 85%)
🔍 Found 3 relevant files
🎯 Root cause identified in volunteer.tsx
📋 Fix plan created (risk: 25%)
🌿 Created branch: auto-fix/vm-123  
🔧 Fix implemented
✅ All tests passed (4/4)
📸 Evidence collected
🎉 PR created: https://github.com/org/repo/pull/123
```

### Example Output
```
📊 Pipeline Results:
Status: SUCCESS
Execution Time: 45.2s
✅ Bug fix completed successfully!
🔗 PR: https://github.com/verse-mate/verse-mate/pull/123
🌿 Branch: auto-fix/vm-123
🧪 Tests: 4 tests run
   ✅ Passed: 4
📸 Evidence: 3 screenshots, 2 videos, 4 test reports
```

## 🔧 Integration Points

### Jira MCP Server
```typescript
// Extract bug details
const bug = await jiraMcp.getIssue(ticketId);
const fields = bug.fields;

// Update ticket with results  
await jiraMcp.addComment(ticketId, {
  body: `Automated fix completed: ${prUrl}`
});
```

### Playwright MCP Server
```typescript
// Run automated tests
await playwrightMcp.runTest({
  testFile: 'generated-test.spec.ts',
  options: { 
    video: 'on',
    screenshot: 'on-failure' 
  }
});
```

### Claude's Tools
```typescript
// Search codebase
await claudeGrep.search({
  pattern: 'button.*volunteer',
  type: 'tsx'
});

// Apply fixes
await claudeEdit.editFile({
  path: 'volunteer.tsx',
  oldString: 'cursor: "default"',
  newString: 'cursor: "pointer"'
});
```

## 📈 Metrics & Monitoring

Track pipeline effectiveness:

- **Automation Rate**: % of bugs successfully automated
- **Fix Accuracy**: % of fixes that resolve the issue  
- **Time to Resolution**: Average bug-to-fix time
- **Regression Rate**: % of fixes causing new issues
- **Risk Prediction**: Accuracy of risk assessment

## 🎮 Demo Mode

Run the demo to see the pipeline in action:

```bash
npm run demo
```

This simulates fixing a real mobile button issue similar to the ones we fixed in the VerseMate volunteer pages.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Add comprehensive tests for new functionality
4. Update documentation
5. Submit pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🔗 Related Tools

- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Playwright Testing](https://playwright.dev/)
- [GitHub CLI](https://cli.github.com/)
- [Claude MCP](https://github.com/anthropic/mcp)

---

🤖 **Automated Bug Fixer** - Turning bug reports into pull requests, automatically.