import type { Story, StoryDefault } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { useHeader } from "../../hooks/useHeader";
import { useInput } from "../../hooks/useInput";
import { Header } from "./index";

export default {
  title: "ui/Header",
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Story />
        </BrowserRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies StoryDefault;

export const Default: Story = () => {
  const { isFocused, setIsFocusedState } = useInput();
  const { isSmallScreen } = useHeader();

  return (
    <Header.Root>
      <Header.Content>
        {(!isSmallScreen || !isFocused) && <Header.Logo link="/" />}
        <Header.InputBar setIsFocused={setIsFocusedState} />
        {(!isSmallScreen || !isFocused) && (
          <Header.ProfileButton setRightPanelContent={() => {}} />
        )}
      </Header.Content>
    </Header.Root>
  );
};
