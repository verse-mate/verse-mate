import type { Story, StoryDefault } from "@ladle/react";
import type { CSSProperties } from "react";

import { Switch } from "./Switch";

export default {
  title: "ui/Switch",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

export const Default: Story = () => {
  return (
    <div style={styles}>
      <Switch id="switch">Normal</Switch>
      <Switch id="switch-2" disabled checked>
        Disabled checked
      </Switch>
      <Switch id="switch-2" disabled>
        Disabled unchecked
      </Switch>
    </div>
  );
};
