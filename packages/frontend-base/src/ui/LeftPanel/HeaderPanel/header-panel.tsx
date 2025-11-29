import * as RadixTabs from "@radix-ui/react-tabs";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import Image from "next/image";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopicContent } from "../../../Main/Content/TopicContent";
import { selectedBookStore } from "../../../store/book-selection";
import * as Icon from "../../../ui/Icons";
import { explanationTypes } from "../../../utils/commentary-options";
import { Accordion } from "../../Accordion";
import { TestamentControl } from "../../Control";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { Rating } from "../../Rating";
import { SelectDropdown } from "../../SelectDropdown";
import { FilterInput } from "../../SelectDropdown/FilterInput/filter-input";
import { Tabs } from "../../Tabs";
import { VerseGrid } from "../../VerseGrid/verse-grid";
import styles from "./header-panel.module.css";

type Props = {
  isViewingTopic: boolean;
  topicDetails: any;
  leftPanelIsOpen: boolean;
  leftPanelSetIsOpen: (value: boolean) => void;
  book?: string;
  verseIdToString: string;
  leftPanelSelectedVerse: string | null;
  leftPanelSelectedTab: string;
  leftPanelHandleTabChange: (value: string) => void;
  leftPanelDebouncedFilter: string;
  leftPanelHandleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  leftPanelResetFilter: () => void;
  leftPanelFilteredBooks: string[];
  oldTestamentBooks: {
    b: number;
    g: number;
    c: number;
    n: string;
    t: TestamentEnum;
  }[];
  newTestamentBooks: {
    b: number;
    g: number;
    c: number;
    n: string;
    t: TestamentEnum;
  }[];
  bookId: number;
  verseId: number;
  leftPanelHandleVerseSelect: (
    bookId: string,
    bookName: string,
    verseId: string,
    testament: TestamentEnum,
  ) => void;
  setActiveTab: Dispatch<SetStateAction<string>>;
  explanationType: string;
  handleValueChange: (value: ExplanationTypeEnum) => void;
  explanation:
    | {
        book_id?: number;
        chapter_number?: number;
        explanation: string | null;
        type?: ExplanationTypeEnum | null;
        explanation_id?: number | null;
      }
    | null
    | undefined;
  maxRating: number;
  currentRating: number;
  hoverRating: number | null;
  totalRatings: number;
  averageRating: number;
  setRating: (rating: number) => void;
  setHoverRating: (rating: number | null) => void;
  saveSearchParams: ({
    bookId,
    verseId,
    testament,
    conversationId,
    explanationId,
    explanationType,
    bibleVersion,
  }: {
    bookId?: string;
    verseId?: string;
    testament?: TestamentEnum;
    conversationId?: string;
    explanationId?: string;
    explanationType?: ExplanationTypeEnum;
    bibleVersion?: string;
  }) => void;
  recentlyViewedBooks: string[];
  forceDropdownOpen?: boolean; // TEMPORARY: For tour development/inspection
};

export const Nav = ({
  isViewingTopic,
  topicDetails,
  leftPanelIsOpen,
  leftPanelSetIsOpen,
  book,
  leftPanelSelectedVerse,
  verseIdToString,
  leftPanelHandleTabChange,
  leftPanelSelectedTab,
  leftPanelDebouncedFilter,
  leftPanelHandleChange,
  leftPanelResetFilter,
  leftPanelFilteredBooks,
  oldTestamentBooks,
  newTestamentBooks,
  bookId,
  verseId,
  leftPanelHandleVerseSelect,
  setActiveTab,
  explanationType,
  explanation,
  averageRating,
  currentRating,
  hoverRating,
  maxRating,
  totalRatings,
  setRating,
  setHoverRating,
  saveSearchParams,
  handleValueChange,
  recentlyViewedBooks,
  forceDropdownOpen = false, // TEMPORARY: For tour development/inspection
}: Props) => {
  const [activeTopicTab, setActiveTopicTab] = useState("EVENTS");
  const [currentTab, setCurrentTab] = useState("tab1");
  const selectedBook = selectedBookStore.get();

  useEffect(() => {
    if (isViewingTopic && topicDetails?.topic?.category_name) {
      const categoryMap: { [key: string]: string } = {
        EVENT: "EVENTS",
        PROPHECY: "PROPHECIES",
        PARABLE: "PARABLES",
        THEME: "THEMES",
      };
      const frontendCategory = categoryMap[topicDetails.topic.category_name];
      if (frontendCategory) {
        setActiveTopicTab(frontendCategory);
      }
    }
  }, [isViewingTopic, topicDetails]);

  // Automatically switch to the correct tab when dropdown opens
  useEffect(() => {
    if (leftPanelIsOpen) {
      if (isViewingTopic) {
        // If viewing a topic, switch to TOPICS tab and set the correct category
        leftPanelHandleTabChange("TOPICS");

        if (topicDetails?.topic?.category_name) {
          const categoryMap: { [key: string]: string } = {
            EVENT: "EVENTS",
            PROPHECY: "PROPHECIES",
            PARABLE: "PARABLES",
            THEME: "THEMES",
          };
          const frontendCategory =
            categoryMap[topicDetails.topic.category_name];
          if (frontendCategory) {
            setActiveTopicTab(frontendCategory);
          }
        }
      } else {
        // If viewing a Bible chapter, determine which testament
        const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
        const currentBook = allBooks.find((book) => book.b === bookId);
        if (currentBook) {
          leftPanelHandleTabChange(currentBook.t);
        }
      }
    }
  }, [
    leftPanelIsOpen,
    isViewingTopic,
    topicDetails,
    bookId,
    oldTestamentBooks,
    newTestamentBooks,
    leftPanelHandleTabChange,
  ]);

  // Updated fixedItem logic
  const fixedItem = leftPanelFilteredBooks.some(
    (bookName) =>
      oldTestamentBooks.some((t) => t.n === bookName && t.b === bookId) ||
      newTestamentBooks.some((t) => t.n === bookName && t.b === bookId),
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleAccordionTriggerClick = useCallback(
    (bookName: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const accordionTrigger = scrollContainer.querySelector(
        `[data-accordion-trigger="${bookName}"]`,
      ) as HTMLElement | null;
      if (!accordionTrigger) return;

      const FIXED_OFFSET = fixedItem ? 48 : 0;
      const BUFFER = 12;
      const THRESHOLD = 2;

      const containerRect = scrollContainer.getBoundingClientRect();
      const triggerRect = accordionTrigger.getBoundingClientRect();

      let attempts = 0;
      const maxAttempts = 36;

      const getContentAndRowHeight = () => {
        const content =
          accordionTrigger.nextElementSibling as HTMLElement | null;
        let rowHeight = 0;

        if (content) {
          const firstCell = content.querySelector(
            ".verseNumber",
          ) as HTMLElement | null;
          if (firstCell) {
            const rect = firstCell.getBoundingClientRect();
            rowHeight = Math.max(0, rect.height);
          }
        }
        return { content, rowHeight };
      };

      // Custom smooth scroll function with slower, nicer animation
      const smoothScrollTo = (targetPosition: number, duration = 600) => {
        const startPosition = scrollContainer.scrollTop;
        const distance = targetPosition - startPosition;
        const startTime = performance.now();

        const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          const easedProgress = easeOutCubic(progress);
          const currentPosition = startPosition + distance * easedProgress;

          scrollContainer.scrollTo({
            top: currentPosition,
          });

          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          }
        };

        requestAnimationFrame(animateScroll);
      };

      const measureAndScroll = () => {
        if (!scrollContainerRef.current) return;
        attempts += 1;

        const { content: accordionContent, rowHeight: measuredRow } =
          getContentAndRowHeight();

        const currentScrollTop = scrollContainer.scrollTop;
        const containerHeight = scrollContainer.clientHeight;

        const triggerTop =
          triggerRect.top - containerRect.top + currentScrollTop;
        const triggerBottom = triggerTop + triggerRect.height;
        const targetTopCap = Math.max(0, triggerTop - FIXED_OFFSET - BUFFER);
        const maxScrollTop =
          scrollContainer.scrollHeight - scrollContainer.clientHeight;

        const isOpen = accordionContent?.getAttribute("data-state") === "open";
        const contentFullHeight = Math.max(
          0,
          accordionContent?.scrollHeight ?? 0,
        );

        if (!accordionContent || !isOpen || contentFullHeight === 0) {
          if (attempts < maxAttempts) requestAnimationFrame(measureAndScroll);
          return;
        }

        const availableBelow =
          containerHeight - (triggerBottom - currentScrollTop);
        const desiredDelta = Math.max(
          0,
          contentFullHeight - availableBelow + BUFFER,
        );

        if (desiredDelta <= 0) {
          return;
        }

        const maxScrollTopNow =
          scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (
          attempts < maxAttempts &&
          currentScrollTop >= maxScrollTopNow &&
          desiredDelta > 0
        ) {
          requestAnimationFrame(measureAndScroll);
          return;
        }

        const fallbackRowHeight = 60;
        const rowHeight = measuredRow > 0 ? measuredRow : fallbackRowHeight;
        const snappedDelta = Math.ceil(desiredDelta / rowHeight) * rowHeight;

        let targetScrollTop = Math.min(
          currentScrollTop + snappedDelta,
          targetTopCap,
        );
        targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

        if (Math.abs(targetScrollTop - currentScrollTop) > THRESHOLD) {
          smoothScrollTo(targetScrollTop, 400);
        }
      };

      setTimeout(() => {
        // Check if component is still mounted before proceeding
        if (scrollContainerRef.current) {
          requestAnimationFrame(measureAndScroll);
        }
      }, 220);
    },
    [fixedItem],
  );

  const renderSelectedBook = () => {
    const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
    const selectedBook = allBooks.find((book) => book.b === bookId);
    if (!selectedBook || leftPanelDebouncedFilter.trim()) return null;

    return (
      <Accordion.Item value={selectedBook.n} key={selectedBook.n}>
        <div
          data-accordion-trigger={selectedBook.n}
          onClick={() => handleAccordionTriggerClick(selectedBook.n)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              handleAccordionTriggerClick(selectedBook.n);
          }}
          role="button"
          tabIndex={0}
        >
          <Accordion.Trigger label={selectedBook.n} highlightBook={true} />
        </div>
        <Accordion.Content styles={fixedItem ? { position: "relative" } : {}}>
          <VerseGrid
            testament={selectedBook.t}
            bookId={String(selectedBook.b)}
            bookName={selectedBook.n}
            verses={Array.from({ length: selectedBook.c }, (_, i) =>
              (i + 1).toString(),
            )}
            onVerseSelect={leftPanelHandleVerseSelect}
            selectedVerse={String(verseId)}
            selectedBook={String(bookId)}
          />
        </Accordion.Content>
      </Accordion.Item>
    );
  };

  const renderAccordionItems = (testament: "OT" | "NT") => {
    const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
    const filteredBooksWithData = leftPanelFilteredBooks
      .map((bookName) => allBooks.find((t) => t.n === bookName))
      .filter((book): book is NonNullable<typeof book> => book !== undefined);

    const booksToShow = filteredBooksWithData.filter((book) => {
      if (leftPanelDebouncedFilter.trim()) {
        return true;
      }
      return book.t === testament && book.b !== bookId;
    });

    // Get recently viewed books (all testaments) when no filter is applied
    const recentlyViewedForTestament = !leftPanelDebouncedFilter.trim()
      ? recentlyViewedBooks
          .filter((id) => Number(id) !== bookId)
          .map((bookId) => {
            const book = allBooks.find((b) => b.b === Number(bookId));
            if (!book) return null;
            return (
              <Accordion.Item value={book.n} key={`recently-${book.n}`}>
                <div
                  data-accordion-trigger={book.n}
                  data-tour-john={book.n === "John" ? "" : undefined}
                  onClick={() => handleAccordionTriggerClick(book.n)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      handleAccordionTriggerClick(book.n);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <Accordion.Trigger
                    label={book.n}
                    highlightBook={false}
                    icon={
                      <Icon.HistoryIcon
                        style={{
                          width: "16px",
                          height: "16px",
                          marginRight: "8px",
                          fill: "var(--charcoal-grey)",
                        }}
                      />
                    }
                    iconPosition="right"
                  />
                </div>
                <Accordion.Content>
                  <VerseGrid
                    testament={book.t}
                    bookId={String(book.b)}
                    bookName={book.n}
                    verses={Array.from({ length: book.c }, (_, i) =>
                      (i + 1).toString(),
                    )}
                    onVerseSelect={leftPanelHandleVerseSelect}
                    selectedVerse={String(verseId)}
                    selectedBook={String(bookId)}
                  />
                </Accordion.Content>
              </Accordion.Item>
            );
          })
          .filter(Boolean)
      : [];

    // Filter out recently viewed books from the main list to avoid duplicates
    const regularBooks = booksToShow.filter((book) => {
      return !recentlyViewedBooks.includes(String(book.b));
    });

    const allItemsToRender = regularBooks.map((book) => {
      return (
        <Accordion.Item value={book.n} key={book.n}>
          <div
            data-accordion-trigger={book.n}
            data-tour-john={book.n === "John" ? "" : undefined}
            onClick={() => handleAccordionTriggerClick(book.n)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ")
                handleAccordionTriggerClick(book.n);
            }}
            role="button"
            tabIndex={0}
          >
            <Accordion.Trigger label={book.n} highlightBook={false} />
          </div>
          <Accordion.Content>
            <VerseGrid
              testament={book.t}
              bookId={String(book.b)}
              bookName={book.n}
              verses={Array.from({ length: book.c }, (_, i) =>
                (i + 1).toString(),
              )}
              onVerseSelect={leftPanelHandleVerseSelect}
              selectedVerse={String(verseId)}
              selectedBook={String(bookId)}
            />
          </Accordion.Content>
        </Accordion.Item>
      );
    });

    // Return recently viewed books first, then regular books
    return [...recentlyViewedForTestament, ...allItemsToRender];
  };

  return (
    <TestamentControl.Root>
      <div className={styles.verseMateLogo}>
        <Image
          src={"/assets/logo/white-regular-logo.png"}
          alt="VerseMate Logo"
          quality={100}
          priority={true}
          fill={true}
        />
      </div>
      {/* Desktop buttons */}
      <div className={styles.leftPanelDropdown} data-tour="book-selector">
        <SelectDropdown.Root
          open={forceDropdownOpen || leftPanelIsOpen}
          onOpenChange={leftPanelSetIsOpen}
          resetFilter={leftPanelResetFilter}
        >
          {!book && !isViewingTopic ? (
            <SelectDropdown.GroupedSelect.Skeleton />
          ) : (
            <>
              <SelectDropdown.Trigger
                selectedBook={
                  isViewingTopic
                    ? topicDetails?.topic?.name ?? "Topic"
                    : selectedBook
                }
                selectedVerse={
                  isViewingTopic
                    ? ""
                    : verseIdToString || leftPanelSelectedVerse
                }
                icon={<Icon.ChevronDownIcon />}
                defaultPlaceholder="Book"
                theme="dark" // Explicitly set dark theme for header context
                context="bible-selection" // Add bible-selection context for mobile visibility
                expandText={true} // Enable text expansion for better readability
              />
            </>
          )}
          <SelectDropdown.Content
            align="start"
            style={{
              width: "420px",
              marginTop: "16px",
            }}
          >
            <Tabs.Root
              value={leftPanelSelectedTab}
              onValueChange={(value) => {
                leftPanelHandleTabChange(value);
                if (value === "TOPICS") {
                  setActiveTopicTab("EVENTS");
                }
              }}
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
                  dataTour="nt-tab"
                />
                <Tabs.Trigger
                  value="TOPICS"
                  label="Topics"
                  resetFilter={leftPanelResetFilter}
                />
              </Tabs.List>

              <FilterInput
                placeholder={
                  leftPanelSelectedTab === "TOPICS"
                    ? "Search all topics..."
                    : "Filter Books..."
                }
                debouncedFilter={leftPanelDebouncedFilter}
                handleChange={leftPanelHandleChange}
                filterable
                position="under"
              />

              <div
                ref={scrollContainerRef}
                className={styles.contentGroupedTrigger}
                style={{
                  marginTop: "127px",
                  maxHeight: "min(calc(100vh - 230px), 512px)",
                  overflowY: "auto",
                  scrollBehavior: "smooth",
                  paddingBottom: "16px",
                }}
              >
                {leftPanelSelectedTab !== "TOPICS" && (
                  <div
                    className={styles.selectedBook}
                    style={
                      fixedItem ? { position: "relative", marginTop: 48 } : {}
                    }
                  >
                    <Accordion.Root type="multiple">
                      {renderSelectedBook()}
                    </Accordion.Root>
                  </div>
                )}
                <Tabs.Content value="OT">
                  <Accordion.Root>{renderAccordionItems("OT")}</Accordion.Root>
                </Tabs.Content>

                <Tabs.Content value="NT">
                  <Accordion.Root>{renderAccordionItems("NT")}</Accordion.Root>
                </Tabs.Content>
                <Tabs.Content value="TOPICS">
                  <button
                    type="button"
                    onClick={() => leftPanelHandleTabChange("NT")}
                    className={styles.backButton}
                  >
                    <Icon.ChevronBackward className={styles.backButtonIcon} />
                    <span>Back to Books</span>
                  </button>
                  <Tabs.Root
                    value={activeTopicTab}
                    onValueChange={setActiveTopicTab}
                  >
                    <Tabs.List>
                      <Tabs.Trigger value="EVENTS" label="Events" />
                      <Tabs.Trigger value="PROPHECIES" label="Prophecies" />
                      <Tabs.Trigger value="PARABLES" label="Parables" />
                      <Tabs.Trigger value="THEMES" label="Themes" />
                    </Tabs.List>
                    <TopicContent
                      category={activeTopicTab}
                      filter={leftPanelDebouncedFilter}
                      onTopicClick={() => leftPanelSetIsOpen(false)}
                    />
                  </Tabs.Root>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </SelectDropdown.Content>
        </SelectDropdown.Root>
      </div>
      {/* Tablet-only commentary type buttons in header */}
      {currentTab === "tab1" && (
        <div
          className={styles.headerCommentaryButtons}
          data-tour="explanation-types"
        >
          {explanationTypes.map((option) => (
            <button
              type="button"
              key={option.value}
              className={styles.headerCommentaryButton}
              style={{
                backgroundColor:
                  option.value === explanationType
                    ? "var(--dust)"
                    : "#FFFFFF33",
                color:
                  option.value === explanationType
                    ? "var(--night)"
                    : "var(--snow)",
              }}
              onClick={() =>
                handleValueChange(option.value as ExplanationTypeEnum)
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <RadixTabs.Root
        className={styles.responsiveLayout}
        defaultValue="tab1"
        onValueChange={(value) => {
          setActiveTab(value);
          setCurrentTab(value);
        }}
      >
        <RadixTabs.List>
          <RadixTabs.Trigger className={`${styles.trigger}`} value="tab1">
            <Icon.OpenedBook className={` ${styles.active}`} />
          </RadixTabs.Trigger>
          <RadixTabs.Trigger className={`${styles.trigger}`} value="tab2">
            <Icon.ChatIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
          <RadixTabs.Trigger
            className={styles.trigger}
            value="tab3"
            data-tour="menu-button"
          >
            <Icon.HamburgerIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
        </RadixTabs.List>

        <RadixTabs.Content value="tab1">
          <RadixTabs.List>
            <div
              className={styles.explanationTypesButton}
              data-tour="explanation-types"
            >
              {explanationTypes.map((option, index) => (
                <button
                  className={`${styles.trigger} ${styles.active}`}
                  value={`tab${index + 3}`}
                  type="button"
                  key={option.value}
                  style={{
                    borderRadius: "100px",
                    padding: "2px 8px",
                    backgroundColor:
                      option.value === explanationType
                        ? "var(--dust)"
                        : "#FFFFFF33",
                    color:
                      option.value === explanationType
                        ? "var(--night)"
                        : "var(--snow)",
                    fontFamily: "Inter",
                    fontSize: "14px",
                    fontWeight: "500",
                    lineHeight: "24px",
                  }}
                  onClick={() =>
                    handleValueChange(option.value as ExplanationTypeEnum)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </RadixTabs.List>

          {explanation?.explanation && (
            <div className={styles.rightPanelContent}>
              <MarkdownRenderer.Root>
                <MarkdownRenderer.Renderer
                  markdownContent={explanation}
                  className={styles.markdown}
                />
              </MarkdownRenderer.Root>
              <Rating.Root className={styles.rating}>
                <Rating.Title title="Commentary Rating" />
                <Rating.Content>
                  <Rating.Ratings>
                    <Rating.Stars
                      maxRating={maxRating}
                      currentRating={averageRating}
                      hoverRating={hoverRating}
                      setRating={setRating}
                      setHoverRating={setHoverRating}
                    />
                    <Rating.Average
                      maxRating={maxRating}
                      averageRating={averageRating}
                    />
                    <Rating.TotalRatings totalRatings={totalRatings} />
                  </Rating.Ratings>
                  <Rating.Footer
                    currentRating={currentRating}
                    maxRating={maxRating}
                  />
                </Rating.Content>
              </Rating.Root>
            </div>
          )}
        </RadixTabs.Content>

        <RadixTabs.Content value="tab2">
          <RadixTabs.List>
            <RadixTabs.Trigger
              className={styles.trigger}
              value="tab4"
              onClick={() => saveSearchParams({ conversationId: "newChat" })}
            >
              <Icon.PencilSquareIcon className={` ${styles.active}`} />
            </RadixTabs.Trigger>
            <div className={styles.askVerseMateText}>
              <p>Ask VerseMate</p>
            </div>
            <RadixTabs.Trigger
              className={styles.trigger}
              value="tab5"
              data-tour="menu-button"
            >
              <Icon.HistoryIcon className={` ${styles.active}`} />
            </RadixTabs.Trigger>
          </RadixTabs.List>
        </RadixTabs.Content>
      </RadixTabs.Root>
    </TestamentControl.Root>
  );
};
