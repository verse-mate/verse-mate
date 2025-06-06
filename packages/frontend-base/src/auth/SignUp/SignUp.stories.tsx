import type { Story, StoryDefault } from "@ladle/react";

import { SignUp } from ".";

export default {
  title: "auth/SignUp",
} satisfies StoryDefault;

const wrapper = {
  margin: "0 auto",
  maxWidth: "500px",
};

export const Default: Story = () => (
  <div style={wrapper}>
    <SignUp />
  </div>
);
