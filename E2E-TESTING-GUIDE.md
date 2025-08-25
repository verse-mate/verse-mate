# Complete E2E Testing Guide for VerseMate

## 📋 **Step-by-Step Process for Writing E2E Tests**

### **Step 1: Understand Your App's Structure**

Before writing tests, explore your app to understand:
- **User flows** (auth, reading, chat)
- **URL structure** (`/book/{bookId}/{chapterNumber}`)
- **UI components** (buttons, forms, modals)
- **API endpoints** (from backend inspection)

```bash
# Use Playwright codegen to explore and record interactions
bunx playwright codegen localhost:3000
```

### **Step 2: Plan Your Test Categories**

Organize tests by functionality:

```
tests/
├── auth.spec.ts           # Authentication flows
├── bible-reading.spec.ts  # Bible content and explanations  
├── ai-chat.spec.ts        # Chat functionality
├── user-progress.spec.ts  # Progress tracking
├── visual-regression.spec.ts # Screenshots/visual tests
└── utils/
    └── test-helpers.ts    # Reusable test utilities
```

### **Step 3: Write Tests Following This Pattern**

#### **A. Test Structure Template**
```typescript
import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers';

test.describe('Feature Name', () => {
  
  test('should do specific action', async ({ page }) => {
    // 1. Setup - Navigate to page
    await page.goto('/relevant-page');
    await page.waitForLoadState('networkidle');
    
    // 2. Action - Perform user interaction
    await page.click('button:has-text("Click Me")');
    
    // 3. Assert - Verify expected outcome
    await expect(page.locator('.result')).toBeVisible();
    await expect(page.url()).toContain('expected-url');
  });
});
```

#### **B. Best Practices for Each Step**

**Navigation & Setup:**
```typescript
// ✅ Good: Wait for network idle
await page.goto('/book/1/1');
await page.waitForLoadState('networkidle');

// ✅ Good: Use helper functions
await TestHelpers.navigateToChapter(page, 1, 1);

// ❌ Avoid: Arbitrary timeouts
await page.waitForTimeout(5000); // Use specific waits instead
```

**Element Selection:**
```typescript
// ✅ Good: Multiple selector strategies (flexible)
const loginButton = page.locator('a[href*="login"], button:has-text("Login"), [data-testid="login"]');

// ✅ Good: Check if element exists before interacting
if (await loginButton.isVisible()) {
  await loginButton.click();
}

// ✅ Good: Use data-testid for stable selectors
const chatInput = page.locator('[data-testid="chat-input"]');
```

**Assertions:**
```typescript
// ✅ Good: Wait for conditions
await expect(page.locator('.ai-response')).toBeVisible({ timeout: 30000 });

// ✅ Good: Multiple assertion types
await expect(page.url()).toContain('expected');
await expect(page.locator('text=Success')).toBeVisible();

// ✅ Good: Content-based assertions for AI features
await expect(page.locator('text=/creation|God|beginning/i')).toBeVisible();
```

### **Step 4: Handle VerseMate-Specific Scenarios**

#### **A. Authentication Tests**
```typescript
test('User signup flow', async ({ page }) => {
  await page.goto('/create-account');
  
  // Use unique email to avoid conflicts
  const uniqueEmail = `test-${Date.now()}@example.com`;
  
  await TestHelpers.fillForm(page, {
    firstName: 'John',
    lastName: 'Doe', 
    email: uniqueEmail,
    password: 'SecurePassword123!'
  });
  
  await page.click('button[type="submit"]');
  
  // Verify email verification flow
  await expect(page.locator('text=/verify|check your email/i')).toBeVisible();
});
```

#### **B. Bible Reading Tests**
```typescript
test('AI explanation generation', async ({ page }) => {
  await TestHelpers.navigateToChapter(page, 1, 1); // Genesis 1
  
  // Test each explanation type
  for (const type of ['Summary', 'Detailed', 'Verse by Verse']) {
    await TestHelpers.selectExplanationType(page, type);
    
    // AI content should be meaningful
    await expect(page.locator('text=/God|creation|beginning/i')).toBeVisible();
  }
});
```

#### **C. AI Chat Tests**
```typescript
test('Contextual AI conversation', async ({ page }) => {
  await TestHelpers.navigateToChapter(page, 1, 1);
  
  // Start chat about chapter
  await TestHelpers.sendChatMessage(page, 'What happened on day 1 of creation?');
  await TestHelpers.waitForAIResponse(page);
  
  // Follow-up question (tests context retention)
  await TestHelpers.sendChatMessage(page, 'What about day 2?');
  await TestHelpers.waitForAIResponse(page);
  
  // Verify contextual response
  await expect(page.locator('text=/sky|expanse|waters/i')).toBeVisible();
});
```

### **Step 5: Advanced Testing Techniques**

#### **A. Error Handling Tests**
```typescript
test('API error handling', async ({ page }) => {
  // Mock API failure
  await page.route('**/api/bible/book/explanation/**', route => {
    route.fulfill({ status: 500, body: 'Server Error' });
  });
  
  await page.goto('/book/1/1');
  await page.click('button:has-text("Summary")');
  
  // Should show error state
  await expect(page.locator('text=/error|failed|try again/i')).toBeVisible();
});
```

#### **B. Visual Regression Tests**
```typescript
test('Homepage visual consistency', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Compare against baseline screenshot
  await expect(page).toHaveScreenshot('homepage.png');
});
```

#### **C. Mobile Responsiveness**
```typescript
test('Mobile Bible reading experience', async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  
  await TestHelpers.navigateToChapter(page, 1, 1);
  
  // Test mobile-specific interactions
  await page.locator('.mobile-menu-toggle').click();
  await expect(page.locator('.mobile-menu')).toBeVisible();
});
```

### **Step 6: Running and Debugging Tests**

#### **A. Running Tests**
```bash
# Run all tests
bun test

# Run specific test file
bunx playwright test tests/bible-reading.spec.ts

# Run with visual browser
bun run test:headed

# Run specific test case
bunx playwright test --grep "User can rate AI explanations"
```

#### **B. Debugging Failed Tests**
```bash
# Debug mode (pauses execution)
bunx playwright test --debug

# Generate trace files
bunx playwright test --trace=on

# View trace in browser
bunx playwright show-trace trace.zip
```

### **Step 7: Test Data Management**

#### **A. Test User Setup**
```typescript
// Create test fixtures for consistent data
test.beforeEach(async ({ page }) => {
  // Setup test user if needed
  await TestHelpers.createTestUser('test@example.com', 'password123');
});

test.afterEach(async ({ page }) => {
  // Cleanup test data
  await TestHelpers.cleanupTestData();
});
```

#### **B. Mock External Services**
```typescript
// Mock OpenAI API for consistent AI responses
test.beforeEach(async ({ page }) => {
  await page.route('**/api/openai/**', route => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: 'Mock AI response about creation' } }]
      })
    });
  });
});
```

### **Step 8: CI/CD Integration**

#### **A. GitHub Actions Configuration**
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bunx playwright install --with-deps
      - run: bun dev & # Start app in background
      - run: bun test # Run tests
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 🎯 **Key Testing Strategies for VerseMate**

### **1. User Journey Testing**
Test complete user flows from start to finish:
- New user signup → email verification → first Bible reading → AI chat
- Returning user login → continue reading → rate explanations → view progress

### **2. AI Feature Testing**
- **Explanation Generation**: Test all three types (summary, detailed, verse-by-verse)
- **Chat Context**: Verify AI stays within chapter scope
- **Error Handling**: Test when AI services are down
- **Response Quality**: Assert meaningful content appears

### **3. Progressive Enhancement Testing**
- Test with JavaScript disabled
- Test with slow network conditions
- Test offline functionality if implemented

### **4. Data Persistence Testing**
- Verify user progress is saved
- Test reading history accuracy
- Verify ratings persist across sessions

This comprehensive approach ensures your VerseMate E2E tests cover all critical functionality while being maintainable and reliable!