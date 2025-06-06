import type { Story, StoryDefault } from "@ladle/react";

import { Text } from "./Text";

export default {
  title: "ui/typography",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <div>
      <Text>Text example</Text>
      <Text variant="b">Text example</Text>
      <Text variant="b" align="center" color="var(--dust)" overflow="auto">
        Text example
      </Text>
    </div>
  );
};
