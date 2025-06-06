import type { Story, StoryDefault } from "@ladle/react";
import type { CSSProperties } from "react";

import { Link } from "./";

export default {
  title: "ui/Link",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const row: CSSProperties = {
  display: "flex",
  gap: "1rem",
};

export const Text: Story = () => (
  <div style={styles}>
    <b>{"> Static"}</b>

    <Link href="#">None</Link>

    <Link href="#" variant="underline">
      Underline
    </Link>

    <b>{"> Animated"}</b>
    <Link href="#" variant="flash">
      Flash
    </Link>

    <Link href="#" variant="goTo">
      Go to
    </Link>
  </div>
);

export const Button: Story = () => (
  <div style={styles}>
    <b>{"> Button appearance"}</b>

    <div style={row}>
      <Link.Button href="#">Link</Link.Button>
      <Link.Button href="#" variant="outlined">
        Link
      </Link.Button>
      <Link.Button href="#" variant="ghost">
        Link
      </Link.Button>
    </div>

    <div style={row}>
      <Link.Button href="#" color="error">
        Link
      </Link.Button>
      <Link.Button href="#" color="error" variant="outlined">
        Link
      </Link.Button>
      <Link.Button href="#" color="error" variant="ghost">
        Link
      </Link.Button>
    </div>
  </div>
);
