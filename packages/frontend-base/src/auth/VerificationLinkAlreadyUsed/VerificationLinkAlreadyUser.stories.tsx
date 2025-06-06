import type { Story, StoryDefault } from "@ladle/react";

import { VerificationLinkAlreadyUsed } from ".";

export default {
  title: "auth/VerificationLinkAlreadyUser",
} satisfies StoryDefault;

export const Default: Story = () => <VerificationLinkAlreadyUsed />;
