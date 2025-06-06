import type { Story, StoryDefault } from "@ladle/react";

import { SignIn } from ".";
import { AuthWrapper } from "../Wrapper";

export default {
  title: "auth/SignIn",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <AuthWrapper>
      <SignIn />
    </AuthWrapper>
  );
};
