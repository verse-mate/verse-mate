/**
 * @deprecated D-009 + D-014 — Q&A feature removed; frontend-next is admin-only.
 *
 * This file is part of the user-facing Bible reader Chat / Q&A flow that has
 * been deprecated per Phase 1 decision D-009 (Q&A removed entirely) AND
 * Epic 12 (frontend-next scoped to admin-only).
 *
 * Removal is pending — companion PR to "feat: drop Q&A entirely" (#204) will
 * delete this file along with the Chat UI and migrate consumers in
 * main-content.tsx, RightPanel, Header.
 *
 * Do NOT add new code here; do NOT add new callers.
 */

import type { Message } from "../hooks/useInput";

export const messages: Message[] = [
  {
    role: "user",
    content:
      "What is the main message of the Parable of the Wedding Feast in Matthew 22:1-14?",
  },
  {
    role: "assistant",
    content: {
      content: `The parable shows that God's kingdom is open to everyone, but we need to accept His invitation and come prepared. It teaches us that we can’t just show up; we must live a life that honors God to truly be part of His kingdom.`,
    },
  },
  {
    role: "user",
    content: `Why did Jesus say "Give back to Caesar what is Caesar's, and to God what is God's" in Matthew 22:21?`,
  },
  {
    role: "assistant",
    content: {
      content: `Jesus was responding to a trap set by the Pharisees and Herodians about paying taxes to Caesar. If He said yes, He'd upset the Jews; if no, He'd be seen as rebelling against Rome. By saying "Give back to Caesar what is Caesar's, and to God what is God's," Jesus acknowledged the legitimacy of paying taxes while emphasizing that our ultimate allegiance is to God.\n\nThe coin had Caesar's image, representing earthly authority. Humans are made in God's image, signifying our higher duty to Him. This teaches us to balance our civic duties with our spiritual commitments, ensuring our actions reflect both our responsibilities as citizens and our devotion to God.`,
    },
  },
];
