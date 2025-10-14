import type { Story, StoryDefault } from "@ladle/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { fetchAllChaptersByBook, fetchBookVerse } from "../../hooks/useBible";
import type { Message } from "../../hooks/useInput";
import { useProgressBar } from "../../hooks/useProgressBar";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import {
  useArrayFilter,
  useSelectDropdown,
} from "../../hooks/useSelectDropdown";
import { useSidebar } from "../../hooks/useSidebar";
import { bibleVersions } from "../../utils/bible-versions";
import { options } from "../../utils/menu-options";
import { testaments } from "../../utils/testaments";
import { messages } from "../../utils/user-ai-messages";
import { Accordion } from "../Accordion";
import { TestamentControl } from "../Control";
import { Conversation } from "../Conversation";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  SidebarIcon,
  VerseMateIcon,
} from "../Icons";
import { Label } from "../Label";
import { MainText } from "../MainText";
import { Menu } from "../Menu";
import { ProgressBar } from "../ProgressBar";
import { SelectDropdown } from "../SelectDropdown";
import { FilterInput } from "../SelectDropdown/FilterInput/filter-input";
import { Tabs } from "../Tabs";
import { VerseGrid } from "../VerseGrid/verse-grid";
import styles from "./left-panel.module.css";

export default {
  title: "ui/LeftPanel",
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

export const Main: Story = () => {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const toggleRightPanel = () => {
    setIsRightPanelOpen(!isRightPanelOpen);
  };

  const { bookId, verseId } = useGetSearchParams();
  const { chapters } = fetchAllChaptersByBook(Number(bookId));
  const { bookVerseData } = fetchBookVerse(Number(bookId), verseId, "NASB1995");
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  const {
    buttonRef: leftPanelButtonRef,
    isOpened: leftPanelIsOpened,
    sidebarRef: leftPanelSidebarRef,
    toggleSidebar: leftPanelToggleSidebar,
  } = useSidebar();

  const {
    isOpen: versionIsOpen,
    setIsOpen: VersionSetIsOpen,
    selectedBook: versionSelectedBook,
    selectedVerse: versionSelectedVerse,
  } = useSelectDropdown();

  const {
    handleChange: handleOnChange,
    filteredArray,
    debouncedFilter: debounceOnFilter,
  } = useArrayFilter(bibleVersions);

  const {
    isOpen: leftPanelIsOpen,
    setIsOpen: leftPanelSetIsOpen,
    selectedBook: leftPanelSelectedBook,
    selectedVerse: leftPanelSelectedVerse,
    selectedTab: leftPanelSelectedTab,
    filteredBooks: leftPanelFilteredBooks,
    debouncedFilter: leftPanelDebouncedFilter,
    handleChange: leftPanelHandleChange,
    handleTabChange: leftPanelHandleTabChange,
    handleVerseSelect: leftPanelHandleVerseSelect,
    resetFilter: leftPanelResetFilter,
  } = useSelectDropdown(testaments);

  const { progress } = useProgressBar({
    totalChapters: chapters,
    currentVerse: Number(verseId),
  });

  const oldTestamentBooks =
    testaments?.filter((testament) => testament.t === "OT") || [];
  const newTestamentBooks =
    testaments?.filter((testament) => testament.t === "NT") || [];
  const book = testaments?.find((testament) => testament.b === bookId)?.n;

  return (
    <div className={styles.container}>
      <main className={`${styles.main} ${isRightPanelOpen ? styles.hide : ""}`}>
        <section
          className={`${styles.leftSide} ${isRightPanelOpen ? styles.hide : ""}`}
        >
          <TestamentControl.Root>
            <Menu.Root
              style={{
                marginLeft: "24px",
              }}
            >
              <Menu.Trigger
                buttonRef={leftPanelButtonRef}
                isOpened={leftPanelIsOpened}
                toggleSidebar={leftPanelToggleSidebar}
              />
              <Menu.Sidebar
                isOpened={leftPanelIsOpened}
                sidebarRef={leftPanelSidebarRef}
                style={{
                  position: "absolute",
                  top: "56px",
                  height: "calc(100% - 56px)",
                }}
              >
                <Accordion.Root>
                  {options.map((option) => (
                    <Accordion.Item key={option.name} value={option.name}>
                      <Accordion.Trigger
                        label={option.label}
                        icon={option.icon}
                      />
                      <Accordion.Content styles={{ padding: "20px 24px" }}>
                        {option.content}
                      </Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
              </Menu.Sidebar>
            </Menu.Root>

            <div style={{ marginLeft: "48px", display: "flex", gap: "48px" }}>
              <SelectDropdown.Root
                label="Version: "
                open={versionIsOpen}
                onOpenChange={VersionSetIsOpen}
              >
                <SelectDropdown.Trigger
                  selectedBook={versionSelectedBook}
                  selectedVerse={versionSelectedVerse}
                  icon={<ChevronDownIcon />}
                  defaultPlaceholder="Version"
                />

                <SelectDropdown.Content
                  align="start"
                  style={{ width: "480px", marginTop: "16px" }}
                >
                  <FilterInput
                    placeholder="Filter Versions..."
                    debouncedFilter={debounceOnFilter}
                    handleChange={handleOnChange}
                    filterable
                    position="top"
                  />

                  <div
                    style={{
                      marginTop: "64px",
                      maxHeight: "512px",
                      overflowY: "auto",
                    }}
                  >
                    {filteredArray.map((version, index) => (
                      <SelectDropdown.Item
                        key={version.key}
                        icon={<CheckIcon />}
                        value={`item-${index}`}
                      >
                        {version.value}
                      </SelectDropdown.Item>
                    ))}
                  </div>
                </SelectDropdown.Content>
              </SelectDropdown.Root>

              <SelectDropdown.Root
                label="Book: "
                open={leftPanelIsOpen}
                onOpenChange={leftPanelSetIsOpen}
                resetFilter={leftPanelResetFilter}
              >
                <SelectDropdown.Trigger
                  selectedBook={leftPanelSelectedBook || book || null}
                  selectedVerse={leftPanelSelectedVerse || verseIdToString}
                  icon={<ChevronDownIcon />}
                  defaultPlaceholder="Book"
                />
                <SelectDropdown.Content
                  align="start"
                  style={{ width: "390px", marginTop: "16px" }}
                >
                  <Tabs.Root
                    value={leftPanelSelectedTab}
                    onValueChange={leftPanelHandleTabChange}
                  >
                    <Tabs.List>
                      <Tabs.Trigger
                        value="OT"
                        label="Old Testament"
                        resetFilter={leftPanelResetFilter}
                      />
                      <Tabs.Trigger
                        value="NT"
                        label="New Testament"
                        resetFilter={leftPanelResetFilter}
                      />
                    </Tabs.List>

                    <FilterInput
                      placeholder="Filter Books..."
                      debouncedFilter={leftPanelDebouncedFilter}
                      handleChange={leftPanelHandleChange}
                      filterable
                      position="under"
                    />

                    <div
                      style={{
                        marginTop: "128px",
                        maxHeight: "512px",
                        overflowY: "auto",
                      }}
                    >
                      <Tabs.Content value="OT">
                        <Accordion.Root>
                          {leftPanelFilteredBooks.map((bookName) => {
                            const book = oldTestamentBooks.find(
                              (t) => t.n === bookName,
                            );
                            if (!book) return null;

                            return (
                              <Accordion.Item value={book.n} key={book.n}>
                                <Accordion.Trigger
                                  label={book.n}
                                  highlightBook={
                                    leftPanelSelectedBook === book.n
                                  }
                                />
                                <Accordion.Content>
                                  <VerseGrid
                                    testament={book.t as TestamentEnum}
                                    bookId={String(book.b)}
                                    bookName={book.n}
                                    verses={Array.from(
                                      { length: book.c },
                                      (_, i) => (i + 1).toString(),
                                    )}
                                    onVerseSelect={leftPanelHandleVerseSelect}
                                    selectedVerse={leftPanelSelectedVerse}
                                    selectedBook={leftPanelSelectedBook}
                                  />
                                </Accordion.Content>
                              </Accordion.Item>
                            );
                          })}
                        </Accordion.Root>
                      </Tabs.Content>

                      <Tabs.Content value="NT">
                        <Accordion.Root>
                          {leftPanelFilteredBooks.map((bookName) => {
                            const book = newTestamentBooks.find(
                              (t) => t.n === bookName,
                            );
                            if (!book) return null;

                            return (
                              <Accordion.Item value={book.n} key={book.n}>
                                <Accordion.Trigger
                                  label={book.n}
                                  highlightBook={
                                    leftPanelSelectedBook === book.n
                                  }
                                />
                                <Accordion.Content>
                                  <VerseGrid
                                    testament={book.t as TestamentEnum}
                                    bookId={String(book.b)}
                                    bookName={book.n}
                                    verses={Array.from(
                                      { length: book.c },
                                      (_, i) => (i + 1).toString(),
                                    )}
                                    onVerseSelect={leftPanelHandleVerseSelect}
                                    selectedVerse={leftPanelSelectedVerse}
                                    selectedBook={leftPanelSelectedBook}
                                  />
                                </Accordion.Content>
                              </Accordion.Item>
                            );
                          })}
                        </Accordion.Root>
                      </Tabs.Content>
                    </div>
                  </Tabs.Root>
                </SelectDropdown.Content>
              </SelectDropdown.Root>
            </div>

            <button
              type="button"
              onClick={toggleRightPanel}
              className={styles.toggleButton}
            >
              <SidebarIcon className={styles.sidebarIcon} />
            </button>
          </TestamentControl.Root>
          {bookVerseData && (
            <div
              style={{
                overflowY: "auto",
                height: "calc(100% - 88px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <MainText.Root>
                <MainText.Content
                  bookId={String(bookId)}
                  verseId={String(verseId)}
                  book={bookVerseData}
                />
              </MainText.Root>
            </div>
          )}
          {bookVerseData && (
            <ProgressBar.Root>
              <ProgressBar.IndicatorBackground>
                <ProgressBar.Indicator value={progress} />
              </ProgressBar.IndicatorBackground>
              <ProgressBar.Label value={progress} />
            </ProgressBar.Root>
          )}
        </section>
      </main>
    </div>
  );
};

export const AskVerseMate: Story = () => {
  const queryClient = useQueryClient();
  const { bookId, verseId } = useGetSearchParams();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(false);
  const [_isPending, _setIsPending] = useState<boolean>(false);
  const [initialMessageHandled, setInitialMessageHandled] =
    useState<boolean>(false);
  const [_userMessage, setUserMessage] = useState<string | null>(null);
  const [_processedMessage, _setProcessedMessage] = useState<string | null>(
    null,
  );
  const toggleRightPanel = () => {
    setIsRightPanelOpen(!isRightPanelOpen);
  };

  const searchParams = new URLSearchParams(window.location.search);
  const ask = searchParams.get("ask");

  useQuery({
    queryKey: ["conversation"],
    queryFn: () => queryClient.getQueryData<Message[]>(["conversation"]),
    initialData: [],
  });

  const _addUserMessage = useCallback(
    (message: string) => {
      const newMessage = { role: "user", content: message };
      queryClient.setQueryData(["conversation"], (oldData: Message[]) => [
        ...(oldData || []),
        newMessage,
      ]);
    },
    [queryClient],
  );

  // if (!bookId && !verseId) return;

  const _parsedBookId = String(bookId).padStart(2, "0");
  const _parsedVerseId = String(verseId).padStart(2, "0");

  useEffect(() => {
    if (ask && !initialMessageHandled) {
      setInitialMessageHandled(true);
      setUserMessage(ask);
    }
  }, [ask, initialMessageHandled]);

  return (
    <div className={styles.container}>
      <main className={`${styles.main} ${isRightPanelOpen ? styles.hide : ""}`}>
        {/* Left Panel */}
        <section
          className={`${styles.leftSide} ${isRightPanelOpen ? styles.hide : ""}`}
        >
          <TestamentControl.Root
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <a href="/" className={styles.arrowLeft}>
              <ArrowLeftIcon />
            </a>
            <Label>Ask VerseMate</Label>

            <button
              type="button"
              onClick={toggleRightPanel}
              className={styles.toggleButton}
            >
              <SidebarIcon className={styles.sidebarIcon} />
            </button>
          </TestamentControl.Root>

          <div
            style={{
              overflowY: "auto",
              height: "calc(100% - 56px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Conversation.Root>
              <Conversation.Content>
                {messages.map((data, index) => {
                  if (
                    data.role === "user" &&
                    typeof data.content === "string"
                  ) {
                    return (
                      <Conversation.UserMessageBlock
                        key={index.toString()}
                        message={data.content}
                      />
                    );
                  }

                  if (
                    data.role === "assistant" &&
                    typeof data.content === "object"
                  ) {
                    return (
                      <Conversation.AIMessageBlock
                        icon={<VerseMateIcon />}
                        key={index.toString()}
                        message={data.content.content}
                      />
                    );
                  }

                  return null;
                })}
              </Conversation.Content>
            </Conversation.Root>
          </div>
        </section>
      </main>
    </div>
  );
};
