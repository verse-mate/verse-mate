import type { Story, StoryDefault } from "@ladle/react";
import type { CSSProperties } from "react";

import { Legend } from "./Legend";

export default {
  title: "ui/Legend",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

export const Default: Story = () => (
  <div style={styles}>
    <Legend>Default</Legend>
    <Legend color="var(--error)">Error</Legend>
    <Legend color="var(--violet-4)">Violet 4</Legend>
    <Legend color="var(--green-6)">green 6</Legend>
  </div>
);
