# Tasks: Backend Plugin Test Coverage Improvement

> Spec: @.agent-os/specs/2025-10-06-backend-test-coverage/spec.md
> Created: 2025-10-06

## Overview

Implementation checklist for increasing backend test coverage from 63.81% functions / 74.43% lines to 75-80% functions / 80-85% lines by testing low-hanging fruit endpoints in bible, admin, and healthcheck plugins.

## Task Checklist

### Phase 1: Healthcheck Plugin Tests (Priority: High)

- [ ] **1.1** Create `packages/backend-base/src/healthcheck/healthcheck.test.ts` file
- [ ] **1.2** Implement test: `GET /health` - overall health status check
- [ ] **1.3** Implement test: `GET /health/database` - database connection check
- [ ] **1.4** Implement test: `GET /health/cache` - Redis connection check
- [ ] **1.5** Verify healthcheck.plugin.ts achieves 100% coverage

**Success Criteria**: All 3 healthcheck endpoints tested, 100% plugin coverage

---

### Phase 2: User Plugin Completion (Priority: High)

- [ ] **2.1** Add test for `GET /user` endpoint to existing `user.test.ts`
- [ ] **2.2** Test authentication requirement for user listing endpoint
- [ ] **2.3** Verify user.plugin.ts achieves 95%+ coverage

**Success Criteria**: User plugin fully tested, all endpoints covered

---

### Phase 3: Bible Plugin - CRUD Endpoints (Priority: High)

- [ ] **3.1** Create `packages/backend-base/src/bible/bible.test.ts` file
- [ ] **3.2** Setup test helpers: authenticated user creation, test data seeding

**Bookmarks Tests:**
- [ ] **3.3** Test `GET /bible/book/bookmarks/:user_id` - get user bookmarks
- [ ] **3.4** Test `POST /bible/book/bookmark/add` - add bookmark
- [ ] **3.5** Test `DELETE /bible/book/bookmark/remove` - remove bookmark
- [ ] **3.6** Test bookmark validation (invalid user_id, invalid book_id)

**Notes Tests:**
- [ ] **3.7** Test `GET /bible/book/notes/:user_id` - get user notes
- [ ] **3.8** Test `POST /bible/book/note/add` - add note
- [ ] **3.9** Test `PUT /bible/book/note/update` - update note content
- [ ] **3.10** Test `DELETE /bible/book/note/remove` - delete note
- [ ] **3.11** Test note validation and error cases

**Highlights Tests:**
- [ ] **3.12** Test `GET /bible/highlights/:user_id` - get all user highlights
- [ ] **3.13** Test `GET /bible/highlights/:user_id/:book_id/:chapter_number` - get chapter highlights
- [ ] **3.14** Test `POST /bible/highlight/add` - add highlight with color
- [ ] **3.15** Test `PUT /bible/highlight/:highlight_id` - update highlight color
- [ ] **3.16** Test `DELETE /bible/highlight/:highlight_id` - delete highlight

**Ratings Tests:**
- [ ] **3.17** Test `POST /bible/book/explanation/save-rating` - save rating
- [ ] **3.18** Test `PUT /bible/book/explanation/update-rating` - update rating
- [ ] **3.19** Test `POST /bible/book/explanation/ratings` - get ratings stats

**Success Criteria**: 18 CRUD endpoints tested, proper error handling verified

---

### Phase 4: Bible Plugin - Query Endpoints (Priority: Medium)

**Static Data Queries:**
- [ ] **4.1** Test `GET /bible/books` - returns book list (no auth required)
- [ ] **4.2** Test `GET /bible/languages` - returns available explanation languages
- [ ] **4.3** Test `GET /bible/testaments` - returns testament list
- [ ] **4.4** Test `GET /bible/book/:bookId/:chapterNumber` - get book chapter with optional version

**Dynamic Queries:**
- [ ] **4.5** Test `GET /bible/chapter-id/:bookId/:chapterNumber` - returns chapter ID
- [ ] **4.6** Test `POST /bible/book/conversation-exists` - check if chat exists
- [ ] **4.7** Test `POST /bible/book/chapter/last-read` - get last chapter read
- [ ] **4.8** Test `POST /bible/book/chapter/save-last-read` - save last chapter read

**Success Criteria**: All query endpoints tested, bible.plugin.ts achieves 60%+ coverage

---

### Phase 5: Admin Plugin - User Management (Priority: Medium)

- [ ] **5.1** Create `packages/backend-base/src/admin/admin.test.ts` file
- [ ] **5.2** Setup admin user test helper with proper permissions

**User Management Tests:**
- [ ] **5.3** Test `GET /admin/users` - list all users (admin only)
- [ ] **5.4** Test `PATCH /user/preferences` - update user language preference
- [ ] **5.5** Test `PATCH /admin/user/:id/admin-status` - toggle admin status
- [ ] **5.6** Verify non-admin users are blocked from admin endpoints

**Success Criteria**: User management endpoints tested with proper authorization

---

### Phase 6: Admin Plugin - Prompt Management (Priority: Medium)

**System Prompts:**
- [ ] **6.1** Test `GET /admin/prompts/system` - list system prompts
- [ ] **6.2** Test `POST /admin/prompts/system` - create system prompt
- [ ] **6.3** Test `PUT /admin/prompts/system/:id` - update system prompt
- [ ] **6.4** Test `DELETE /admin/prompts/system/:id` - delete system prompt
- [ ] **6.5** Test `PUT /admin/prompts/system/:id/status` - update prompt status

**User Prompts:**
- [ ] **6.6** Test `GET /admin/prompts/user` - list user prompts
- [ ] **6.7** Test `POST /admin/prompts/user` - create user prompt
- [ ] **6.8** Test `PUT /admin/prompts/user/:id` - update user prompt
- [ ] **6.9** Test `DELETE /admin/prompts/user/:id` - delete user prompt
- [ ] **6.10** Test `PUT /admin/prompts/user/:id/status` - update user prompt status

**Utility Endpoints:**
- [ ] **6.11** Test `GET /admin/prompts/explanation-types` - get explanation types
- [ ] **6.12** Test `POST /admin/prompts/restore-defaults` - restore default prompts

**Success Criteria**: 12 prompt management endpoints tested

---

### Phase 7: Admin Plugin - Batch History (Priority: Low)

- [ ] **7.1** Test `GET /admin/batch-history` - get batch job history (simple query)
- [ ] **7.2** Test `GET /admin/batch-children/:parentId` - get child batches
- [ ] **7.3** Test `GET /admin/batch-summary/:parentId` - get batch summary
- [ ] **7.4** Test `GET /admin/batch/:batchJobId` - get batch status
- [ ] **7.5** Test `DELETE /admin/batch/:batchJobId` - cancel batch

**Success Criteria**: Batch history queries tested (without complex batch operations), admin.plugin.ts achieves 50%+ coverage

---

### Phase 8: Verification & Documentation (Priority: High)

- [ ] **8.1** Run `bun test` - verify all tests pass
- [ ] **8.2** Run `bun test --coverage` - verify coverage targets met
- [ ] **8.3** Verify function coverage: 63.81% → 75-80%
- [ ] **8.4** Verify line coverage: 74.43% → 80-85%
- [ ] **8.5** Verify bible.plugin.ts: 0% → 60%+
- [ ] **8.6** Verify admin.plugin.ts: 0% → 50%+
- [ ] **8.7** Verify healthcheck.plugin.ts: 0% → 100%
- [ ] **8.8** Update spec with final coverage numbers
- [ ] **8.9** Commit changes with descriptive message
- [ ] **8.10** Verify tests pass in CI/CD pipeline

**Success Criteria**: All coverage targets met, tests pass in CI/CD

---

## Notes

- **Test Pattern**: Follow existing patterns from `auth.test.ts` using `getTestClient` and faker
- **Database Setup**: Reuse test user creation and seeding patterns from existing tests
- **Authentication**: Use signup → login → token pattern for authenticated endpoints
- **Out of Scope**: AI-powered endpoints, complex batch operations (require extensive mocking)
- **Coverage Command**: `cd packages/backend-base && bun test --coverage`

## Dependencies

- No new external dependencies required
- Uses existing: `bun:test`, `@faker-js/faker`, Elysia test utilities

## Estimated Effort

- Phase 1 (Healthcheck): 1-2 hours
- Phase 2 (User completion): 30 minutes
- Phase 3 (Bible CRUD): 4-6 hours
- Phase 4 (Bible queries): 2-3 hours
- Phase 5 (Admin users): 1-2 hours
- Phase 6 (Admin prompts): 3-4 hours
- Phase 7 (Admin batch history): 1-2 hours
- Phase 8 (Verification): 1 hour

**Total**: ~14-21 hours of focused implementation
