import type { Story, StoryDefault } from "@ladle/react";
import { Commentary } from "./index";

export default {
  title: "ui/Commentary",
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <Commentary.Root>
      <Commentary.Content>
        <Commentary.Title title="Explanation of Matthew 22:1-14 - The Parable of the Wedding Feast" />
        <Commentary.Explanation
          subtitle="Summary of the Parable"
          explanation={`The Parable of the Wedding Feast in Matthew 22:1-14 tells a story of a king who hosts a wedding feast for his son. He sends his servants out to invite selected guests, but they refuse to come. After a second invitation is also ignored, with some guests going as far as mistreating and killing the messengers, the king becomes enraged and punishes those murderers by destroying their city.
Subsequently, the king instructs his servants to invite everyone they can find, leading to the wedding hall being filled with guests. However, upon noticing a guest not dressed in wedding clothes, the king queries him and, getting no response, orders the servants to cast him out into the darkness. The parable concludes with the poignant line, "For many are called, but few are chosen."`}
        />
      </Commentary.Content>
    </Commentary.Root>
  );
};
