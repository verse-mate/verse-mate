import { DialogContent as Content } from "./Content";
import { DialogFooter as Footer } from "./Footer";
import { Description, DialogHead as Head } from "./Head";
import { type DialogProps, DialogRoot } from "./Root";

export const Dialog = Object.assign(DialogRoot, {
  Content,
  Footer,
  Head,
  Description,
});

export type { DialogProps };
