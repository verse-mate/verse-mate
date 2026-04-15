# Claude Code + Lovable Workflow

A guide for using Claude Code as the primary development agent with Lovable as the prototyping/hosting platform and GitHub as the sync layer.

## Architecture

```
┌─────────────┐     git push     ┌──────────┐    2-way sync    ┌──────────┐
│ Claude Code  │ ──────────────▶ │  GitHub   │ ◀──────────────▶ │ Lovable  │
│ (local CLI)  │                 │  (repo)   │                  │ (preview)│
└──────┬───────┘                 └──────────┘                   └──────────┘
       │                                                              │
       │  reads/writes source                              live preview
       │  runs builds locally                              auto-deploys
       ▼                                                              ▼
  Local filesystem                                        Browser iframe
```

**Claude Code** writes source code locally, builds, tests, and pushes to GitHub.
**Lovable** syncs from GitHub via 2-way sync and auto-deploys a live preview.
**You** review the preview in Lovable and report bugs back to Claude Code.

## Setup

### 1. Create the Lovable project

1. Go to [lovable.dev](https://lovable.dev) and create a new project
2. Send an initial prompt to scaffold the app (Lovable generates the initial Vite + React + TypeScript + Tailwind + shadcn project)
3. In Project Settings → GitHub, connect to your GitHub repo

### 2. Clone the repo locally

```bash
git clone https://github.com/your-org/your-repo.git
cd your-repo
bun install  # or npm install
```

### 3. Verify the local dev server works

```bash
bun run dev
# Open http://localhost:5173 to verify
```

### 4. Start coding with Claude Code

```bash
claude
```

Claude Code now has full access to read, edit, build, and push.

## The Workflow Loop

### Step 1: Describe what you want

Tell Claude Code what to build. Be specific about the design reference:

```
Build a dark-themed reading screen matching the Figma Mobile App
section. Use exact hex colors: #000000 body, #1A1A1A header, #323232
pill containers, #B09A6D gold accent.
```

### Step 2: Claude Code edits + builds + pushes

Claude Code will:
1. Edit the source files
2. Run `bunx vite build` to verify no build errors
3. `git add + commit + push` to the connected GitHub repo

### Step 3: Lovable auto-syncs

Within ~60 seconds, Lovable's 2-way GitHub sync picks up the push and rebuilds the preview. You'll see the commit message appear in Lovable's chat panel.

### Step 4: QA in the Lovable preview

Click through the preview. Take screenshots of bugs. Paste them back to Claude Code:

```
Bug: the Commentary tabs are not centered. See screenshot.
[paste screenshot]
```

### Step 5: Claude Code fixes + pushes again

Claude reads your screenshot, identifies the issue, edits the code, builds, pushes. Repeat until pixel-perfect.

## Key Principles

### 1. Always build before pushing

Claude Code should ALWAYS run `bunx vite build` (or equivalent) before pushing. A broken build = blank Lovable preview = wasted iteration.

### 2. One commit per logical change

Don't bundle 10 fixes into one commit. Each fix should be its own commit so you can identify which change broke something.

### 3. Use the Figma API for design truth

Instead of eyeballing screenshots, extract exact values from Figma:

```bash
# Fetch frame fills, fonts, and colors
curl -s -H "X-Figma-Token: YOUR_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/nodes?ids=NODE_ID&depth=6" \
  | python3 extract_styles.py
```

This gives you exact hex colors, font families, weights, sizes, and spacing — no guessing.

### 4. Port production source, don't reinvent

If a production app already exists, clone its repo and read the actual CSS/components:

```bash
git clone https://github.com/org/production-repo.git prod
cat prod/packages/frontend/src/ui/Component/component.module.css
```

Use the exact production values (colors, spacing, fonts) instead of approximating from screenshots.

### 5. Keep Lovable chat clean

Don't use Lovable's chat to make changes. All code changes go through Claude Code → GitHub → Lovable sync. Lovable's chat is only used for the initial scaffold. After that, the chat becomes a commit log.

If Lovable's chat has queued messages, pause them before pushing from Claude Code to avoid conflicts.

## Connecting to a Real Backend

The Lovable project starts with mock data. To connect to a real backend:

1. **Read the backend's OpenAPI spec:**
   ```bash
   curl -s https://api.yourapp.com/openapi/json | python3 -m json.tool
   ```

2. **Create an API client** (`src/services/api.ts`) with base URL from `VITE_API_URL`

3. **Replace mock functions** in your service layer one at a time, keeping the mock as a fallback:
   ```typescript
   export async function fetchData(): Promise<Data[]> {
     try {
       const resp = await api.get('/data');
       return resp.data;
     } catch {
       return MOCK_DATA; // fallback while developing
     }
   }
   ```

4. **Smoke test** each endpoint with `curl` before wiring it into the UI

## Troubleshooting

### Lovable preview is blank

1. Check if the local build passes: `bunx vite build`
2. If it fails, the error message tells you exactly what's wrong
3. Common cause: missing import, wrong export name, TypeScript error
4. Fix, rebuild, push, wait for sync

### Lovable preview shows old content

1. The GitHub sync takes ~60 seconds
2. Click the refresh icon in Lovable's preview toolbar
3. If still stale, push a trivial commit to force a rebuild:
   ```bash
   echo "/* $(date +%s) */" >> src/index.css
   git add . && git commit -m "chore: force rebuild" && git push
   ```

### Lovable chat shows queued messages

If you were using Lovable's chat and then switched to Claude Code:
1. Pause the queue in Lovable
2. Clear any pending messages
3. Push from Claude Code
4. Lovable will sync the GitHub push

### Git push rejected (403)

Your GitHub token doesn't have write access to the repo. Fix:
```bash
gh api repos/org/repo --jq '.permissions'
# If push: false, ask the repo owner to add you as a collaborator
```

## File Structure

A typical Lovable + Claude Code project:

```
src/
├── components/          # Shared UI components
│   ├── ScreenHeader.tsx  # Reusable dark header
│   ├── MarkdownBlock.tsx # Markdown renderer
│   └── ShareIcon.tsx     # Custom SVG icons
├── contexts/
│   └── AppContext.tsx     # Global state (useReducer + Context)
├── pages/               # Route-level screens
│   ├── ReadingScreen.tsx
│   ├── CommentaryScreen.tsx
│   ├── MenuScreen.tsx
│   └── ...
├── services/
│   ├── api.ts           # Typed fetch client with auth
│   ├── bibleService.ts  # All API calls (swappable mock → real)
│   └── types.ts         # Domain types
└── index.css            # Design tokens + utility classes
```

## Example: VerseMate

This workflow was used to build VerseMate — a mobile Bible reading app:

- **Figma source**: `GOiiI0yRby5mWqCji8e4pp` (Mobile App section `5162:5662`)
- **Lovable project**: `7f2ca37c-8a1d-4e26-baa4-e92839178242`
- **GitHub repo**: `verse-mate/versemate`
- **Backend API**: `https://api.versemate.org`
- **Production source**: `verse-mate/verse-mate` (monorepo with `packages/frontend-base`)

### What worked well

- Extracting exact Figma colors via the API eliminated pixel-guessing
- Reading the production CSS modules gave exact font/spacing values
- The `vite build` gate caught every broken import before it reached Lovable
- One-commit-per-fix made it easy to identify regressions

### What to avoid

- Don't let Lovable's chat and Claude Code fight over the same files
- Don't guess at colors from screenshots — use Figma API or production source
- Don't skip the local build check — a broken push means a blank preview
- Don't mix design references (Figma dark vs production light) — pick one and stick with it
