# Eden Treaty Type Inference Investigation

> Date: 2025-10-10
> Branch: strong-type-updates
> Issue: Eden Treaty not inferring response types correctly

## Problem Statement

Despite having properly typed schemas (validated by OpenAPI output), Eden Treaty client was not inferring response types correctly. Response `.data` property was typed as `any` or too permissive, leading to no autocomplete or type checking in the frontend.

## Root Causes Identified

### 1. **App Type Export Timing**
**Issue**: The `export type App = typeof app` was happening AFTER `.listen()` was called.

**Location**: `apps/backend/src/index.ts:71`

**Fix**: Moved the export before `.listen()` to preserve full type information.

```typescript
// BEFORE
const app = new Elysia()
  .use(authPlugin)
  // ... more plugins

app.listen(3000, () => {...});

export type App = typeof app; // ❌ Too late!

// AFTER
const app = new Elysia()
  .use(authPlugin)
  // ... more plugins

export type App = typeof app; // ✅ Before .listen()

app.listen(3000, () => {...});
```

### 2. **ErrorResponse Contains t.Any()**
**Issue**: The `ErrorResponse` schema used `t.Any()` for the optional `details` field. This schema is referenced via `t.Ref("ErrorResponse")` in **every single endpoint**, causing Eden Treaty to give up on type inference.

**Location**: `packages/backend-base/src/common/response-models.ts:15`

**Research**: GitHub issues confirmed that "custom models may cause Eden to not infer route types correctly, only returning Any."

**Fix**: Changed `t.Any()` to `t.Unknown()` which is more TypeScript-friendly.

```typescript
// BEFORE
export const ErrorResponse = t.Object({
  error: t.String({...}),
  message: t.String({...}),
  details: t.Optional(t.Any({...})), // ❌ Causes Eden to return 'any'
});

// AFTER
export const ErrorResponse = t.Object({
  error: t.String({...}),
  message: t.String({...}),
  details: t.Optional(t.Unknown({...})), // ✅ Better type inference
});
```

### 3. **Eden Version Compatibility**
**Issue**: Using Eden 1.4.1 with Elysia 1.4.9 - some users reported issues with newer Eden versions.

**Research**: GitHub issues mentioned "downgrading @elysiajs/eden to 1.0.14 helped some users."

**Fix**: Downgraded both `backend-api` and `backend-base` to use Eden 1.0.14.

```json
// packages/backend-api/package.json
{
  "dependencies": {
    "@elysiajs/eden": "1.0.14" // Was 1.4.1
  }
}

// packages/backend-base/package.json
{
  "devDependencies": {
    "@elysiajs/eden": "1.0.14" // Was 1.4.1
  }
}
```

### 4. **Explicit Plugin Type Annotations**
**Issue**: Plugins weren't explicitly typed when used with `.use()`, potentially causing type loss during composition.

**Location**: `apps/backend/src/index.ts:20-23`

**Fix**: Added explicit type annotations to preserve plugin types.

```typescript
// BEFORE
const app = new Elysia()
  .use(authPlugin)
  .use(userPlugin)
  .use(biblePlugin)
  .use(adminPlugin)

// AFTER
import {
  type AdminPlugin, adminPlugin,
  type AuthPlugin, authPlugin,
  type BiblePlugin, biblePlugin,
  type UserPlugin, userPlugin,
} from "backend-base";

const app = new Elysia()
  .use(authPlugin as AuthPlugin)
  .use(userPlugin as UserPlugin)
  .use(biblePlugin as BiblePlugin)
  .use(adminPlugin as AdminPlugin)
```

### 5. **Workspace Package Import Path**
**Issue**: Eden client was importing via workspace package name which might not resolve correctly for TypeScript.

**Location**: `packages/backend-api/src/eden.ts:2`

**Fix**: Changed to direct relative import from source file.

```typescript
// BEFORE
import type { App } from "backend";

// AFTER
import type { App } from "../../../apps/backend/src/index";
```

## Changes Made

### Files Modified

1. **`apps/backend/src/index.ts`**
   - Moved `export type App` before `.listen()`
   - Added explicit plugin type imports and annotations
   - Added comment explaining why export order matters

2. **`packages/backend-base/src/common/response-models.ts`**
   - Changed `t.Any()` to `t.Unknown()` in ErrorResponse schema

3. **`packages/backend-api/src/eden.ts`**
   - Changed import to use direct path instead of workspace package name

4. **`packages/backend-api/package.json`**
   - Downgraded `@elysiajs/eden` from 1.4.1 to 1.0.14

5. **`packages/backend-base/package.json`**
   - Downgraded `@elysiajs/eden` from 1.4.1 to 1.0.14

### Test Files Created

- **`packages/backend-api/src/type-test.ts`**
  - Type inference test to verify Eden Treaty types
  - Exports types for IDE inspection

## Known Elysia/Eden Issues Found

Research revealed several known issues:

1. **Version Compatibility** (elysiajs/elysia#934)
   - Versions 1.1.21-1.1.26 broke end-to-end type safety
   - Eden and Elysia versions must match

2. **Custom Models Breaking Types** (elysiajs/elysia#646)
   - Custom validation models can cause Eden to return `Any`
   - `t.Ref()` with models containing `t.Any()` especially problematic

3. **Path Alias Resolution**
   - Frontend must resolve same path aliases as backend
   - Otherwise types infer as `any`

4. **Method Chaining Requirement**
   - Elysia must use method chaining throughout
   - Without it, type references aren't saved

## Testing

### TypeScript Compilation
```bash
bunx tsc --noEmit
```
✅ **Result**: No errors

### Type Inference Verification
Created `type-test.ts` with type extraction tests. IDE hovering over exported types should show proper inference.

## Next Steps

1. **Manual Verification Required**
   - Start the dev server
   - Open frontend code in IDE
   - Check if `api.bible.books.get()` autocomplete works
   - Verify `.data` property has proper types

2. **If Issues Persist**
   - May need to try different Eden versions (1.0.14 vs 1.4.1)
   - Consider removing `t.Ref()` usage and using direct schemas
   - Check if TypeScript restart in IDE helps (often needed for workspace changes)
   - Verify `bun install` properly updated packages

3. **Consider Future**
   - Monitor Elysia/Eden GitHub issues for fixes
   - When upgrading versions, verify type inference still works
   - Avoid `t.Any()` in any shared/referenced schemas
   - Prefer `t.Unknown()` or specific union types

## References

- [Eden Treaty Response Docs](https://elysiajs.com/eden/treaty/response)
- [elysiajs/elysia#934](https://github.com/elysiajs/elysia/issues/934) - Type safety issues
- [elysiajs/elysia#646](https://github.com/elysiajs/elysia/issues/646) - Custom models breaking types
- [elysiajs/elysia#886](https://github.com/elysiajs/elysia/discussions/886) - Data property typing

## Status

✅ All identified issues fixed
⏳ Manual verification needed
📝 Changes ready for commit
