import type { Story, StoryDefault } from "@ladle/react";
import type { CSSProperties } from "react";

import { Button } from "./Button";

export default {
  title: "ui/button",
} satisfies StoryDefault;

const wrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const buttonsContainer: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};

export const Variants: Story = () => (
  <div style={wrapperStyle}>
    <div style={buttonsContainer}>
      <Button color="var(--dust)" variant="contained">
        My Button
      </Button>

      <Button color="var(--dust)" variant="outlined">
        My Button
      </Button>

      <Button color="var(--dust)" variant="ghost">
        My Button
      </Button>
    </div>

    <div style={buttonsContainer}>
      <Button loading color="var(--error)" variant="contained" format="rounded">
        My Button
      </Button>

      <Button loading color="var(--error)" variant="outlined" format="rounded">
        My Button
      </Button>

      <Button loading color="var(--error)" variant="ghost" format="rounded">
        My Button
      </Button>
    </div>

    <div style={buttonsContainer}>
      <Button appearance="text" color="var(--dust)">
        My Button Text
      </Button>

      <Button appearance="text" color="var(--error)">
        My Button Text
      </Button>

      <Button appearance="text" loading color="var(--error)">
        My Button Text
      </Button>
    </div>
  </div>
);
Variants.storyName = "Variants";
