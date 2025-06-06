import type { Story, StoryDefault } from "@ladle/react";
import { type CSSProperties, useCallback, useState } from "react";

import { Button } from "../Button/Button";
import { Alert } from "./Alert";

export default {
  title: "ui/Alert",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

export const Discreet: Story = () => {
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <div style={styles}>
      <Alert type="error" show={open}>
        Something went wrong.
      </Alert>
      <Alert type="success" show={open}>
        Success saved.
      </Alert>
      <Alert type="warning" show={open}>
        Please check requires inputs.
      </Alert>
      <Alert type="info" show={open}>
        We'll send instructions to your email.
      </Alert>

      <Button onClick={toggle}>Toggle</Button>
    </div>
  );
};

export const Colored: Story = () => {
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <div style={styles}>
      <Alert type="error" show={open} variant="colored">
        Something went wrong.
      </Alert>
      <Alert type="success" show={open} variant="colored">
        Success saved.
      </Alert>
      <Alert type="warning" show={open} variant="colored">
        Please check requires inputs.
      </Alert>
      <Alert type="info" show={open} variant="colored">
        We'll send instructions to your email.
      </Alert>

      <Button onClick={toggle}>Toggle</Button>
    </div>
  );
};
