import type { Story, StoryDefault } from "@ladle/react";
import type { CSSProperties } from "react";

import { TextArea } from "./TextArea";

export default {
  title: "ui/textarea",
} satisfies StoryDefault;

const wrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const textAreaContainer: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};

export const Variants: Story = () => (
  <div style={wrapperStyle}>
    <div style={textAreaContainer}>
      <TextArea placeholder="Digite ou cole o seu texto aqui" />
    </div>
  </div>
);
Variants.storyName = "Variants";
