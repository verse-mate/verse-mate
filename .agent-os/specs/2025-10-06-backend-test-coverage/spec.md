# Spec Requirements Document

> Spec: Backend Plugin Test Coverage Improvement
> Created: 2025-10-06

## Overview

Increase automated test coverage for backend plugins by targeting "low hanging fruit" endpoints that are simple to test and don't require complex mocking. Current coverage is 63.81% functions and 74.43% lines, but this masks the fact that entire plugins (bible, admin, healthcheck) have 0% coverage. This will improve code quality, catch regressions early, and establish testing patterns for future development without requiring extensive effort.

## User Stories

### Developer Confidence

As a backend developer, I want comprehensive test coverage for simple CRUD and query endpoints, so that I can refactor code and add features with confidence that existing functionality won't break.

The developer makes changes to the bible bookmarks feature. The test suite runs and immediately catches that the bookmark removal endpoint now returns the wrong status code. The developer fixes the issue before it reaches production.

### CI/CD Pipeline Reliability

As a DevOps engineer, I want automated tests that verify API endpoint functionality, so that the CI/CD pipeline can catch bugs before deployment.

A PR is submitted with changes to the admin user management endpoints. The CI pipeline runs tests and fails because the new code breaks the user listing endpoint. The developer is notified immediately and fixes the issue before merging.

### Regression Prevention

As a product owner, I want tests covering existing functionality, so that new features don't accidentally break working features and reduce support burden.

When adding a new explanation language, the developer accidentally changes query logic that affects the bookmarks feature. The test suite catches this immediately, preventing users from experiencing broken bookmarks in production.

## Spec Scope

1. **Healthcheck Plugin Tests** - Add complete test coverage for all 3 healthcheck endpoints (database, cache, overall health)
2. **User Plugin Completion** - Add missing test for the user listing endpoint to complete user.plugin.ts coverage
3. **Bible CRUD Endpoints** - Add tests for bookmarks, notes, highlights, and ratings endpoints (~20 simple CRUD operations)
4. **Bible Query Endpoints** - Add tests for static data endpoints like books, languages, testaments, and chapter lookups (~5 endpoints)
5. **Admin CRUD Endpoints** - Add tests for user management and prompt management CRUD operations (~15-20 endpoints)

## Out of Scope

- AI-powered endpoints requiring OpenAI API mocking (chat, explanations generation, batch operations)
- Complex batch processing endpoints requiring BullMQ worker mocking
- Frontend test coverage improvements
- Integration tests spanning multiple services
- Performance/load testing
- Test coverage metrics reporting tools

## Expected Deliverable

1. Test files created: `healthcheck.test.ts`, updates to `user.test.ts`, new `bible.test.ts`, new `admin.test.ts`
2. All new tests pass in CI/CD pipeline without environment setup issues
3. Function coverage increases from 63.81% to 75-80%, line coverage from 74.43% to 80-85%
4. Plugin-specific coverage: bible.plugin.ts (0% → 60%+), admin.plugin.ts (0% → 50%+), healthcheck.plugin.ts (0% → 100%)
5. Tests follow existing patterns from `auth.test.ts` using Elysia test client and faker for data generation
