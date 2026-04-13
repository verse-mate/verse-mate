# Project Memory

## Core
VerseMate: mobile-first Bible reading app, 390px viewport, 44px tap targets.
DARK theme by default — warm near-black bg hsl(30,18%,8%), cards hsl(30,14%,12%). Light mode secondary.
Crimson Pro serif for scripture, Inter sans for UI. Accent: warm gold hsl(36,72%,52%).
No backend yet — mock data + localStorage. Service layer in src/services/* for future API swap.
React Context + useReducer for state. Default: John 1 ESV, signed-in.
Figma canonical: "Mobile App" section node 5162:5662 (dark theme with green check).

## Memories
- [Design tokens](mem://design/tokens) — Full color palette, fonts, highlight colors
- [App structure](mem://features/structure) — 29 screens across Auth, Reading, Commentary, Topics, Annotations, Menu flows
- [Bible data](mem://features/bible-data) — Mock chapters: John 1, Psalm 23, Genesis 1, Romans 8 in ESV/NIV/KJV/NLT
