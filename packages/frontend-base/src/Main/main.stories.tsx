import type { Story, StoryDefault } from "@ladle/react";
import { MainPage } from "./index";

export default {
  title: "VerseMate/main",
} satisfies StoryDefault;

export const Main: Story = () => {
  return (
    <>
      <MainPage.QueryProvider>
        <MainPage.BrowserRouter>
          <MainPage.Header setRightPanelContent={() => {}} />
          <MainPage.MainContent />
          <MainPage.Footer />
        </MainPage.BrowserRouter>
      </MainPage.QueryProvider>
    </>
  );
};
