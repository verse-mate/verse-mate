# Technical Specification: Elysia v1.4.9 Upgrade

> Spec: @.agent-os/specs/2025-10-07-elysia-1.4.9-upgrade
> Created: 2025-10-07
> Version: 1.0.0

## Current State Analysis

### Package Versions (Current)

```json
{
  "elysia": "1.4.0",
  "@elysiajs/openapi": "1.4.11",
  "@elysiajs/bearer": "1.4.0",
  "@elysiajs/cors": "1.4.0",
  "@elysiajs/jwt": "1.4.0",
  "@elysiajs/eden": "1.4.0"
}
```

### Target Versions

Need to determine through npm registry:
- `elysia`: 1.4.9 (confirmed latest)
- `@elysiajs/openapi`: Check if update needed
- `@elysiajs/bearer`: Check latest compatible
- `@elysiajs/cors`: Check latest compatible
- `@elysiajs/jwt`: Check latest compatible
- `@elysiajs/eden`: Check latest compatible

### Files Using Elysia

Primary locations:
- `apps/backend/src/index.ts` - Main app composition
- `packages/backend-base/src/*/` - All plugin files:
  - `auth/auth.plugin.ts`
  - `user/user.plugin.ts`
  - `bible/bible.plugin.ts`
  - `admin/admin.plugin.ts`
  - `healthcheck/healthcheck.plugin.ts`
  - `shared/shared.plugin.ts`
- `packages/backend-base/src/**/*.test.ts` - Test files using Eden Treaty

## Breaking Changes Investigation

### Elysia Changelog Review

**Required Research:**
1. Visit https://github.com/elysiajs/elysia/releases
2. Review releases from v1.4.0 to v1.4.9:
   - v1.4.1
   - v1.4.2
   - v1.4.3
   - v1.4.4
   - v1.4.5
   - v1.4.6
   - v1.4.7
   - v1.4.8
   - v1.4.9
3. Document breaking changes, type system changes, plugin API changes
4. Note deprecated features and their replacements

**Common Type Issues to Watch For:**
- Context type changes (`{ body, params, query, headers, store, set, currentUserId }`)
- Plugin initialization signature changes
- Response schema type inference changes
- Guard/hook type signature changes
- Eden Treaty client type generation changes

## Implementation Strategy

### Phase 1: Pre-Flight Checks

**Step 1: Check Latest Plugin Versions**
```bash
npm view @elysiajs/openapi version
npm view @elysiajs/bearer version
npm view @elysiajs/cors version
npm view @elysiajs/jwt version
npm view @elysiajs/eden version
```

**Step 2: Backup Current State**
```bash
git checkout -b elysia-1.4.9-upgrade
git add -A
git commit -m "Checkpoint before Elysia 1.4.9 upgrade"
```

**Step 3: Review Changelog**
- Read release notes for all versions 1.4.0 → 1.4.9
- Document expected breaking changes
- Create TYPE_ERRORS.md to track issues

### Phase 2: Package Updates

**Update package.json files:**

`package.json` (root):
```json
{
  "elysia": "1.4.9",
  "@elysiajs/bearer": "<latest>",
  "@elysiajs/cors": "<latest>",
  "@elysiajs/jwt": "<latest>",
  "@elysiajs/eden": "<latest>"
}
```

`packages/backend-base/package.json`:
```json
{
  "elysia": "1.4.9",
  "@elysiajs/bearer": "<latest>",
  "@elysiajs/cors": "<latest>",
  "@elysiajs/jwt": "<latest>"
}
```

`apps/backend/package.json`:
```json
{
  "elysia": "1.4.9",
  "@elysiajs/openapi": "<latest or 1.4.11>"
}
```

`packages/backend-api/package.json`:
```json
{
  "@elysiajs/eden": "<latest>"
}
```

**Install Dependencies:**
```bash
bun install
```

### Phase 3: Type Error Discovery

**Capture All Type Errors:**
```bash
bunx tsc --noEmit 2>&1 | tee TYPE_ERRORS_RAW.txt
```

**Categorize Errors:**
- Group by file/module
- Group by error type (TS2345, TS2322, TS2339, etc.)
- Prioritize by severity (build-blocking vs. inference hints)

**Document in TYPE_ERRORS.md:**
```markdown
# Type Errors - Elysia 1.4.9 Upgrade

## Error Categories

### Plugin Type Errors
- File: auth.plugin.ts
- Count: X errors
- Pattern: Context type mismatch

### Eden Treaty Type Errors
- File: *.test.ts
- Count: X errors
- Pattern: Client type inference

...
```

### Phase 4: Type Error Resolution Patterns

**Common Fix Patterns:**

**Pattern 1: Context Type Changes**
```typescript
// Before (Elysia 1.4.0)
async ({ body, store }) => { }

// After (Elysia 1.4.9 - if signature changed)
async (context: Context) => {
  const { body, store } = context;
}
```

**Pattern 2: Plugin State Type**
```typescript
// Before
.state((state) => ({ ...state, newField: value }))

// After (if type inference changed)
.state((state): State => ({ ...state, newField: value }))
```

**Pattern 3: Response Schema Type**
```typescript
// Before
response: {
  200: t.Object({ ... })
}

// After (if schema type changed)
response: {
  200: t.Object({ ... }) as const
}
```

**Pattern 4: Guard Type Signature**
```typescript
// Before
.guard({ beforeHandle: async ({ bearer }) => { } })

// After
.guard({ beforeHandle: async (context) => { } })
```

### Phase 5: Incremental Fixes

**Fix Order Priority:**
1. Shared/base plugin types (affects all other plugins)
2. Individual plugin files
3. Test files
4. Main app composition

**Testing After Each Fix:**
```bash
bunx tsc --noEmit  # Check type errors remaining
bun test           # Ensure tests still pass
```

### Phase 6: Validation

**Type Check:**
```bash
bunx tsc --noEmit
# Expected: No errors
```

**Lint Check:**
```bash
bunx biome check --write .
# Expected: Pass
```

**Tests:**
```bash
bun test
# Expected: 30 pass, 13 skip, 0 fail
```

**Builds:**
```bash
cd apps/backend && bun build
cd apps/frontend-next && bun build
# Expected: Both succeed
```

**Runtime Check:**
```bash
bun dev
# Expected: Backend starts, /openapi accessible
```

## Type Error Resolution Checklist

- [ ] Context destructuring in route handlers
- [ ] Plugin state type inference
- [ ] Response schema types
- [ ] Guard/hook signatures
- [ ] Eden Treaty client types
- [ ] Error response types
- [ ] DTO/Schema type definitions
- [ ] Test client type inference
- [ ] Derive/resolve hook types
- [ ] Custom decorator types (if any)

## Rollback Procedure

If upgrade fails:
```bash
git checkout package.json packages/*/package.json apps/*/package.json
bun install
git checkout .
bunx tsc --noEmit  # Verify rollback successful
bun test           # Verify tests pass
```

## Documentation Updates

After successful upgrade:
- Update CLAUDE.md with new Elysia version
- Update .agent-os/specs/2025-10-07-elysia-1.4.9-upgrade/MIGRATION_NOTES.md
- Document type error patterns encountered
- Provide migration guide for similar future upgrades

## Performance Benchmarks

Monitor these metrics before/after:
- Backend startup time: Currently ~2-3 seconds
- Type check compilation time: Currently ~5-10 seconds
- Test suite execution time: Currently ~4-5 seconds
- OpenAPI schema generation: Should remain instant

## Testing Strategy

**Unit Tests:**
- All existing tests must pass
- No new tests required (unless fixing bugs)
- Focus on auth, bible, admin, user, healthcheck modules

**Integration Tests:**
- Manual test of OpenAPI endpoint: `curl http://localhost:3001/openapi`
- Manual test of authenticated endpoints
- Verify Eden Treaty client in frontend

**Type Tests:**
- Compilation must succeed with no errors
- No `@ts-ignore` or `@ts-expect-error` added
- Type inference must work for Eden Treaty

## External Dependencies

No new dependencies required - only version updates of existing packages:
- `elysia` core framework
- `@elysiajs/*` official plugins

All packages are from Elysia official ecosystem with stable APIs.

## Risk Mitigation

**High Risk Items:**
- Context type breaking changes
  - **Mitigation**: Thorough changelog review, incremental fixes

- Eden Treaty incompatibility
  - **Mitigation**: Test frontend immediately, have rollback ready

**Medium Risk Items:**
- Plugin API changes
  - **Mitigation**: Update plugins incrementally, test after each

- Type inference regressions
  - **Mitigation**: Add explicit types where needed

**Low Risk Items:**
- Performance changes
  - **Mitigation**: Run benchmarks before/after

- Documentation URL changes
  - **Mitigation**: Easy fix if needed

## Success Metrics

Final validation criteria:
✅ Zero TypeScript errors
✅ All 30 tests passing
✅ Backend builds successfully
✅ Frontend builds successfully
✅ OpenAPI documentation accessible
✅ No runtime errors in development
✅ Type inference maintained for Eden Treaty
✅ All linting checks passing
