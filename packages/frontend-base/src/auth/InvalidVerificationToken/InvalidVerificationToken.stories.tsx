import type { Story, StoryDefault } from "@ladle/react";

import { InvalidVerificationToken } from ".";

export default {
  title: "auth/InvalidVerificationToken",
} satisfies StoryDefault;

export const Default: Story = () => <InvalidVerificationToken />;
