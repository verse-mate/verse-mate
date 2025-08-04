import authPlugin from "./src/auth/auth.plugin";
import type { AuthPlugin } from "./src/auth/auth.plugin";
import biblePlugin from "./src/bible/bible.plugin";
import type { BiblePlugin } from "./src/bible/bible.plugin";
import { notesPlugin } from "./src/notes/notes.plugin";
import type { NotesPlugin } from "./src/notes/notes.plugin";
import userPlugin from "./src/user/user.plugin";
import type { UserPlugin } from "./src/user/user.plugin";

export {
  type AuthPlugin,
  authPlugin,
  type UserPlugin,
  userPlugin,
  type BiblePlugin,
  biblePlugin,
  type NotesPlugin,
  notesPlugin,
};
