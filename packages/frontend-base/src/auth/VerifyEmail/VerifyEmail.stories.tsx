import type { Story, StoryDefault } from "@ladle/react";

import { VerifyEmail } from "./VerifyEmail";

export default {
  title: "auth/VerifyEmail",
} satisfies StoryDefault;

export const Default: Story = () => <VerifyEmail />;
