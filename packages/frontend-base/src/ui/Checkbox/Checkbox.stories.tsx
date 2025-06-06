import type { Story, StoryDefault } from "@ladle/react";
import { type CSSProperties, useCallback, useState } from "react";

import { Checkbox, type CheckboxProps, type CheckedState } from "./Checkbox";

export default {
  title: "ui/Checkbox",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

export const Default: Story = () => {
  const [state, setState] = useState<CheckedState>("indeterminate");

  const handleChangeIndeterminate = useCallback<
    NonNullable<CheckboxProps["onCheckedChange"]>
  >((value) => {
    setState(value === true ? "indeterminate" : false);
  }, []);
  return (
    <div style={styles}>
      <Checkbox
        id="story-checkbox"
        defaultChecked
        checked={state}
        onCheckedChange={handleChangeIndeterminate}
      >
        Minus
      </Checkbox>

      <Checkbox id="story-checkbox" defaultChecked>
        Check
      </Checkbox>
    </div>
  );
};
