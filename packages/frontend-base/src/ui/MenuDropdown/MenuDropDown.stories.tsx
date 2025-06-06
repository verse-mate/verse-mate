import type { Story, StoryDefault } from "@ladle/react";

import { MenuDropDown } from ".";
import { Button } from "../Button/Button";

export default {
  title: "ui/MenuDropDown",
} satisfies StoryDefault;

export const Default: Story = () => (
  <MenuDropDown>
    <MenuDropDown.Trigger asChild>
      <Button>Trigger</Button>
    </MenuDropDown.Trigger>

    <MenuDropDown.Content side="right" divider>
      <MenuDropDown.Item>Item</MenuDropDown.Item>
      <MenuDropDown.Item>Item</MenuDropDown.Item>
      <MenuDropDown.Item.Link>Link</MenuDropDown.Item.Link>
    </MenuDropDown.Content>
  </MenuDropDown>
);
