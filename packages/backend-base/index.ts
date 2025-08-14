import adminPlugin from "./src/admin/admin.plugin";
import type { AdminPlugin } from "./src/admin/admin.plugin";
import authPlugin from "./src/auth/auth.plugin";
import type { AuthPlugin } from "./src/auth/auth.plugin";
import biblePlugin from "./src/bible/bible.plugin";
import type { BiblePlugin } from "./src/bible/bible.plugin";
import userPlugin from "./src/user/user.plugin";
import type { UserPlugin } from "./src/user/user.plugin";

export {
  type AuthPlugin,
  authPlugin,
  type UserPlugin,
  userPlugin,
  type BiblePlugin,
  biblePlugin,
  type AdminPlugin,
  adminPlugin,
};
