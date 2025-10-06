# Tasks: Elysia v1.4.9 Upgrade - Type Issue Resolution

> Spec: @.agent-os/specs/2025-10-07-elysia-1.4.9-upgrade
> Created: 2025-10-07

## Overview

Incremental task breakdown for upgrading Elysia from v1.4.0 to v1.4.9, with focus on identifying and resolving TypeScript type compatibility issues.

## Task Checklist

### Phase 1: Pre-Upgrade Investigation (Priority: Critical)

- [ ] **1.1** Check latest versions for all Elysia packages
  ```bash
  npm view elysia version
  npm view @elysiajs/openapi version
  npm view @elysiajs/bearer version
  npm view @elysiajs/cors version
  npm view @elysiajs/jwt version
  npm view @elysiajs/eden version
  ```

- [ ] **1.2** Review Elysia changelog from v1.4.0 to v1.4.9
  - Visit: https://github.com/elysiajs/elysia/releases
  - Document breaking changes in TYPE_ERRORS.md
  - Note type system changes
  - List deprecated features

- [ ] **1.3** Create upgrade branch and checkpoint
  ```bash
  git checkout -b elysia-1.4.9-upgrade
  git add -A
  git commit -m "Checkpoint before Elysia 1.4.9 upgrade"
  ```

- [ ] **1.4** Create TYPE_ERRORS.md tracking document

**Success Criteria**: All version information collected, changelog reviewed, branch created

---

### Phase 2: Package Updates (Priority: High)

- [ ] **2.1** Update root package.json
  - Update `elysia` to 1.4.9
  - Update `@elysiajs/bearer` to latest
  - Update `@elysiajs/cors` to latest
  - Update `@elysiajs/jwt` to latest
  - Update `@elysiajs/eden` to latest

- [ ] **2.2** Update packages/backend-base/package.json
  - Update `elysia` to 1.4.9
  - Update `@elysiajs/bearer` to latest
  - Update `@elysiajs/cors` to latest
  - Update `@elysiajs/jwt` to latest

- [ ] **2.3** Update apps/backend/package.json
  - Update `elysia` to 1.4.9
  - Update `@elysiajs/openapi` (if newer than 1.4.11)

- [ ] **2.4** Update packages/backend-api/package.json
  - Update `@elysiajs/eden` to latest

- [ ] **2.5** Run dependency installation
  ```bash
  bun install
  ```

- [ ] **2.6** Verify lockfile updated correctly (bun.lock)

**Success Criteria**: All package.json files updated, dependencies installed successfully

---

### Phase 3: Type Error Discovery (Priority: High)

- [ ] **3.1** Run TypeScript compilation and capture errors
  ```bash
  bunx tsc --noEmit 2>&1 | tee TYPE_ERRORS_RAW.txt
  ```

- [ ] **3.2** Count total number of type errors
  ```bash
  grep "error TS" TYPE_ERRORS_RAW.txt | wc -l
  ```

- [ ] **3.3** Categorize errors by file/module
  - Shared plugin errors
  - Auth plugin errors
  - Bible plugin errors
  - Admin plugin errors
  - User plugin errors
  - Healthcheck plugin errors
  - Test file errors
  - Main app errors

- [ ] **3.4** Categorize errors by type
  - TS2345: Argument type mismatch
  - TS2322: Type not assignable
  - TS2339: Property does not exist
  - TS2769: No overload matches
  - Other error codes

- [ ] **3.5** Document all errors in TYPE_ERRORS.md with:
  - File location
  - Error code
  - Error message
  - Suspected cause
  - Priority (blocking vs. warning)

**Success Criteria**: Complete catalog of all type errors, organized by category

---

### Phase 4: Type Error Resolution - Shared Module (Priority: Critical)

- [ ] **4.1** Fix shared.plugin.ts type errors
  - Context type issues
  - State type issues
  - Store type issues

- [ ] **4.2** Fix auth.utils.ts type errors
  - authDerive type signature
  - authGuard type signature

- [ ] **4.3** Fix admin.utils.ts type errors
  - adminGuard type signature

- [ ] **4.4** Run type check after shared module fixes
  ```bash
  bunx tsc --noEmit
  ```

- [ ] **4.5** Document fixes applied in TYPE_ERRORS.md

**Success Criteria**: Shared module type errors resolved, blocking issues cleared for other modules

---

### Phase 5: Type Error Resolution - Plugin Modules (Priority: High)

- [ ] **5.1** Fix auth.plugin.ts type errors
  - Route handler context types
  - Response schema types
  - Derive/resolve types

- [ ] **5.2** Fix user.plugin.ts type errors
  - Route handler context types
  - Response schema types

- [ ] **5.3** Fix bible.plugin.ts type errors
  - Route handler context types
  - Response schema types
  - Complex nested types

- [ ] **5.4** Fix admin.plugin.ts type errors
  - Route handler context types
  - Response schema types

- [ ] **5.5** Fix healthcheck.plugin.ts type errors
  - Route handler context types
  - Response schema types

- [ ] **5.6** Run type check after each plugin fix
  ```bash
  bunx tsc --noEmit
  ```

- [ ] **5.7** Document all plugin fixes in TYPE_ERRORS.md

**Success Criteria**: All plugin modules compile without type errors

---

### Phase 6: Type Error Resolution - Test Files (Priority: Medium)

- [ ] **6.1** Fix auth.test.ts type errors
  - Eden Treaty client types
  - Test helper types

- [ ] **6.2** Fix user.test.ts type errors
  - Eden Treaty client types

- [ ] **6.3** Fix bible.test.ts type errors
  - Eden Treaty client types
  - Complex route parameter types

- [ ] **6.4** Fix admin.test.ts type errors
  - Eden Treaty client types

- [ ] **6.5** Fix healthcheck.test.ts type errors
  - Eden Treaty client types

- [ ] **6.6** Fix test-helpers.ts type errors
  - createTestUser return types

- [ ] **6.7** Run type check after test file fixes
  ```bash
  bunx tsc --noEmit
  ```

**Success Criteria**: All test files compile without type errors

---

### Phase 7: Type Error Resolution - Main App (Priority: High)

- [ ] **7.1** Fix apps/backend/src/index.ts type errors
  - Plugin composition types
  - OpenAPI configuration types
  - App export types

- [ ] **7.2** Fix any remaining package files
  - packages/backend-api types
  - Frontend type dependencies

- [ ] **7.3** Final full type check
  ```bash
  bunx tsc --noEmit
  ```

- [ ] **7.4** Verify zero type errors

**Success Criteria**: Complete codebase compiles with zero TypeScript errors

---

### Phase 8: Testing & Validation (Priority: Critical)

- [ ] **8.1** Run linting checks
  ```bash
  bunx biome check --write .
  ```

- [ ] **8.2** Run stylelint (if applicable)
  ```bash
  bun stylelint
  ```

- [ ] **8.3** Run full test suite
  ```bash
  bun test
  ```
  - Expected: 30 pass, 13 skip, 0 fail

- [ ] **8.4** Build backend
  ```bash
  cd apps/backend && bun build
  ```

- [ ] **8.5** Build frontend
  ```bash
  cd apps/frontend-next && bun build
  ```

- [ ] **8.6** Start development server
  ```bash
  bun dev
  ```

- [ ] **8.7** Manual smoke tests
  - Access http://localhost:3001/openapi
  - Test authenticated endpoint
  - Test Eden Treaty client in frontend
  - Verify no runtime errors in console

**Success Criteria**: All automated checks pass, manual testing shows no regressions

---

### Phase 9: Documentation & Cleanup (Priority: Medium)

- [ ] **9.1** Complete TYPE_ERRORS.md with:
  - Total errors encountered
  - Resolution strategies used
  - Before/after code examples
  - Lessons learned

- [ ] **9.2** Create MIGRATION_NOTES.md documenting:
  - Breaking changes found
  - Code patterns that needed updates
  - Tips for similar future upgrades

- [ ] **9.3** Update CLAUDE.md
  - New Elysia version: 1.4.9
  - Any new development patterns
  - Updated plugin versions

- [ ] **9.4** Update spec status to "Completed"

- [ ] **9.5** Commit all changes
  ```bash
  git add -A
  git commit -m "Upgrade Elysia to v1.4.9 with type error resolutions"
  ```

- [ ] **9.6** Push to remote
  ```bash
  git push -u origin elysia-1.4.9-upgrade
  ```

**Success Criteria**: All documentation updated, changes committed and pushed

---

## Rollback Tasks (If Needed)

If upgrade encounters insurmountable issues:

- [ ] **R.1** Revert package.json files
  ```bash
  git checkout package.json packages/*/package.json apps/*/package.json
  ```

- [ ] **R.2** Reinstall dependencies
  ```bash
  bun install
  ```

- [ ] **R.3** Revert all code changes
  ```bash
  git checkout .
  ```

- [ ] **R.4** Verify rollback successful
  ```bash
  bunx tsc --noEmit
  bun test
  ```

- [ ] **R.5** Document blocking issues in TYPE_ERRORS.md for future attempts

- [ ] **R.6** Update spec status to "Blocked" with reasons

---

## Notes

- **Estimated Effort**: 4-8 hours (depending on number of type errors)
- **Prerequisites**: Git branch created, changelog reviewed
- **Dependencies**: No external dependencies beyond Elysia packages
- **Testing**: Continuous type checking after each phase
- **Rollback**: Simple git revert if needed

## Progress Tracking

Total Tasks: 56
- Phase 1: 4 tasks
- Phase 2: 6 tasks
- Phase 3: 5 tasks
- Phase 4: 5 tasks
- Phase 5: 7 tasks
- Phase 6: 7 tasks
- Phase 7: 4 tasks
- Phase 8: 7 tasks
- Phase 9: 6 tasks
- Rollback: 6 tasks (conditional)
