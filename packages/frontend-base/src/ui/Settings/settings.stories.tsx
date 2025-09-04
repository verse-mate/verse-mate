import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Settings } from "./Settings";

export default {
  title: "ui/Settings",
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies StoryDefault;

export const Default: Story = () => {
  return (
    <Settings
      selectedBibleVersion="NASB1995"
      setSelectedBibleVersion={() => {}}
      setRightPanelContent={() => {}}
    />
  );
};
