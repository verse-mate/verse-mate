import { DefaultContent } from "../ui/Accordion/Content/default-content";
import * as Icon from "../ui/Icons";

export const options = [
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
