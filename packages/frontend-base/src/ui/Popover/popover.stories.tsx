import type { Story, StoryDefault } from "@ladle/react";
import { textActions } from "../../utils/text-actions";
import { Popover } from "./index";

export default {
  title: "ui/Popover",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <Popover.Root>
      <Popover.Trigger>Open</Popover.Trigger>
      <Popover.Content align="start" sideOffset={10}>
        <Popover.Header>Matthew 22</Popover.Header>
        <Popover.ListItem>
          {textActions.map((action) => {
            return (
              <Popover.Item
                key={action.name}
                icon={action.icon}
                label={action.label}
              />
            );
          })}
        </Popover.ListItem>
      </Popover.Content>
    </Popover.Root>
  );
};
