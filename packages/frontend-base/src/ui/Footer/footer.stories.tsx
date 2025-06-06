import type { StoryDefault } from "@ladle/react";
import type { Story } from "@ladle/react";
import { links } from "../../utils/footer-links";
import { Footer } from "./index";

export default {
  title: "ui/Footer",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <Footer.Root>
      <Footer.Content>
        <Footer.Logo />
        <Footer.Links links={links} />
      </Footer.Content>
    </Footer.Root>
  );
};
