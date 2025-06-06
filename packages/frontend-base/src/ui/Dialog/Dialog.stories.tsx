import type { Story, StoryDefault } from "@ladle/react";
import { type CSSProperties, useCallback, useState } from "react";

import { Dialog } from ".";
import { Button } from "../Button/Button";
import { Input } from "../Input";
import { Text } from "../Text/Text";

export default {
  title: "ui/Dialog",
} satisfies StoryDefault;

const styles: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

export const Default: Story = () => {
  const [state, setState] = useState(false);
  const openDialog = useCallback(() => {
    setState(true);
  }, []);
  return (
    <>
      <Button onClick={openDialog}>Open Dialog</Button>

      <Dialog open={state} onOpenChange={setState} maxWidth={520}>
        <Dialog.Head title="Create tag" />

        <Dialog.Content>
          <div style={styles}>
            <Text>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam
              quis finibus ex, eget eleifend orci. Sed sodales dolor at enim
              luctus, dignissim vestibulum sem pretium. Curabitur diam sem
            </Text>
            <Input.Root>
              <Input.Label label="Tag name" notShow />

              <Input placeholder="Tag name" />
            </Input.Root>

            <Input.Root>
              <Input.Label label="Short description" notShow />

              <Input placeholder="Short description" />
            </Input.Root>
          </div>
        </Dialog.Content>

        <Dialog.Footer>
          <Button>Create new tag</Button>
        </Dialog.Footer>
      </Dialog>
    </>
  );
};
