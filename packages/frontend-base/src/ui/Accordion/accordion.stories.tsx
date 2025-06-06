import type { Story, StoryDefault } from "@ladle/react";
import * as Icon from "../Icons/index";
import { DefaultContent } from "./Content/default-content";
import { Accordion } from "./index";

export default {
  title: "ui/Accordion",
} satisfies StoryDefault;

export const Default: Story = () => {
  const options = [
    {
      name: "textSettings",
      icon: <Icon.TextSettingsIcon />,
      label: "Text Settings",
      content: <DefaultContent value="N/A" />,
    },
    {
      name: "layoutOptions",
      icon: <Icon.LayoutOptions />,
      label: "Layout Options",
      content: <DefaultContent value="N/A" />,
    },
    {
      name: "languageTools",
      icon: <Icon.LanguageTools />,
      label: "Language Tools",
      content: <DefaultContent value="N/A" />,
    },
  ];

  return (
    <Accordion.Root>
      {options.map((option) => (
        <Accordion.Item key={option.name} value={option.name}>
          <Accordion.Trigger label={option.label} icon={option.icon} />
          <Accordion.Content>{option.content}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
};
