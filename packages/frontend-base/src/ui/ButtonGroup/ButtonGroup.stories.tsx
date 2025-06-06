import type { Story, StoryDefault } from "@ladle/react";

import { ButtonGroup } from ".";

export default {
  title: "ui/ButtonGroup",
} satisfies StoryDefault;

export const Vertical: Story = () => (
  <ButtonGroup orientation="vertical">
    <ButtonGroup.Item>1</ButtonGroup.Item>
    <ButtonGroup.Item>2</ButtonGroup.Item>
    <ButtonGroup.Item disabled>3</ButtonGroup.Item>
    <ButtonGroup.Item>4</ButtonGroup.Item>
  </ButtonGroup>
);

export const Horizontal: Story = () => (
  <ButtonGroup appearance="ghost" orientation="horizontal">
    <ButtonGroup.Item disabled>1</ButtonGroup.Item>
    <ButtonGroup.Item>2</ButtonGroup.Item>
    <ButtonGroup.Item disabled>3</ButtonGroup.Item>
    <ButtonGroup.Item>4</ButtonGroup.Item>
  </ButtonGroup>
);
