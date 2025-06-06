import type { Story, StoryDefault } from "@ladle/react";

import { RadioGroup } from ".";

export default {
  title: "ui/RadioGroup",
} satisfies StoryDefault;

export const Default: Story = () => (
  <RadioGroup orientation="vertical">
    <RadioGroup.Item value="opt-1">Option 1</RadioGroup.Item>
    <RadioGroup.Item value="opt-2">Option 2</RadioGroup.Item>
    <RadioGroup.Item value="opt-3">Option 3</RadioGroup.Item>
    <RadioGroup.Item value="opt-4">Option 4</RadioGroup.Item>
    <RadioGroup.Item value="opt-5">Option 5</RadioGroup.Item>
  </RadioGroup>
);
