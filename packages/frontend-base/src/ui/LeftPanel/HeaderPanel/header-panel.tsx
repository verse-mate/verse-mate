import * as RadixTabs from "@radix-ui/react-tabs";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import Image from "next/image";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { selectedBookStore } from "../../../store/book-selection";
import * as Icon from "../../../ui/Icons";
import { bibleVersions } from "../../../utils/bible-versions";
import { explanationTypes } from "../../../utils/commentary-options";
import { Accordion } from "../../Accordion";
import { TestamentControl } from "../../Control";
import { VersionDropdown } from "../../Dropdown";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { Rating } from "../../Rating";
import { SelectDropdown } from "../../SelectDropdown";
import { FilterInput } from "../../SelectDropdown/FilterInput/filter-input";
import { Tabs } from "../../Tabs";
import { VerseGrid } from "../../VerseGrid/verse-grid";
import styles from "./header-panel.module.css";

type Props = {
  leftPanelIsOpen: boolean;
  leftPanelSetIsOpen: (value: boolean) => void;
  leftPanelSelectedBook: string | null;
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
  bibleVersionSelected: string;
  handleBibleVersionSelected: (version: string) => void;
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
};

export const Nav = ({
  leftPanelIsOpen,
  leftPanelSetIsOpen,
  leftPanelSelectedBook,
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
  bibleVersionSelected,
  handleBibleVersionSelected,
  setActiveTab,
  explanationType,
  handleValueChange,
  explanation,
  averageRating,
  currentRating,
  hoverRating,
  maxRating,
  totalRatings,
  setRating,
  setHoverRating,
  saveSearchParams,
}: Props) => {
  const selectedBook = selectedBookStore.get();

  // Updated fixedItem logic
  const fixedItem = leftPanelFilteredBooks.some(
    (bookName) =>
      oldTestamentBooks.some((t) => t.n === bookName && t.b === bookId) ||
      newTestamentBooks.some((t) => t.n === bookName && t.b === bookId),
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Added smooth scrolling function
  const handleAccordionTriggerClick = useCallback(
    (bookName: string, chapterCount: number, isSelectedBook: boolean) => {
      setTimeout(() => {
        if (!scrollContainerRef.current) return;

        const scrollContainer = scrollContainerRef.current;
        const containerHeight = scrollContainer.clientHeight;
        const currentScrollTop = scrollContainer.scrollTop;

        const accordionTrigger = scrollContainer.querySelector(
          `[data-accordion-trigger="${bookName}"]`,
        ) as HTMLElement;
        if (!accordionTrigger) return;

        const triggerRect = accordionTrigger.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        const triggerTop =
          triggerRect.top - containerRect.top + currentScrollTop;
        const fixedBookOffset = fixedItem ? 48 : 0;

        const chaptersPerRow = 5;
        const estimatedRowHeight = 64;
        const estimatedRows = Math.ceil(chapterCount / chaptersPerRow);
        const estimatedContentHeight = estimatedRows * estimatedRowHeight;

        let targetScrollTop = triggerTop - fixedBookOffset;
        targetScrollTop = Math.max(0, targetScrollTop);

        if (Math.abs(targetScrollTop - currentScrollTop) > 10) {
          scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: "smooth",
          });
        }
      }, 200);
    },
    [fixedItem],
  );

  // Added renderAccordionItems function
  const renderAccordionItems = (
    books: typeof oldTestamentBooks,
    testament: "OT" | "NT",
  ) => {
    const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
    const filteredBooksWithData = leftPanelFilteredBooks
      .map((bookName) => allBooks.find((t) => t.n === bookName))
      .filter((book): book is NonNullable<typeof book> => book !== undefined);

    const selectedBook = allBooks.find((book) => book.b === bookId);
    const booksToShow = [];

    if (selectedBook && !leftPanelDebouncedFilter.trim()) {
      booksToShow.push(selectedBook);
    }

    const otherBooks = filteredBooksWithData.filter((book) => {
      if (leftPanelDebouncedFilter.trim()) {
        return true;
      }
      return book.t === testament && book.b !== bookId;
    });

    booksToShow.push(...otherBooks);

    return booksToShow.map((book) => {
      const isSelectedBook = book.b === bookId;

      return (
        <Accordion.Item value={book.n} key={book.n}>
          <div
            data-accordion-trigger={book.n}
            onClick={() =>
              handleAccordionTriggerClick(book.n, book.c, isSelectedBook)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ")
                handleAccordionTriggerClick(book.n, book.c, isSelectedBook);
            }}
            role="button"
            tabIndex={0}
          >
            <Accordion.Trigger label={book.n} highlightBook={isSelectedBook} />
          </div>
          <Accordion.Content
            styles={fixedItem && isSelectedBook ? { position: "relative" } : {}}
          >
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
      <div className={styles.leftPanelDropdown}>
        <SelectDropdown.Root
          open={leftPanelIsOpen}
          onOpenChange={leftPanelSetIsOpen}
          resetFilter={leftPanelResetFilter} // Kept resetFilter prop
        >
          {!book ? (
            <SelectDropdown.GroupedSelect.Skeleton />
          ) : (
            <>
              <SelectDropdown.Trigger
                selectedBook={selectedBook}
                selectedVerse={verseIdToString || leftPanelSelectedVerse}
                icon={<Icon.ChevronDownIcon />}
                defaultPlaceholder="Book"
              />
            </>
          )}
          <SelectDropdown.Content
            align="start"
            style={{
              width: "390px",
              marginTop: "16px",
            }}
          >
            <Tabs.Root
              value={leftPanelSelectedTab}
              onValueChange={leftPanelHandleTabChange}
            >
              <Tabs.List>
                <Tabs.Trigger
                  value="OT"
                  label="Old Testament"
                  resetFilter={leftPanelResetFilter} // Kept resetFilter prop
                />
                <Tabs.Trigger
                  value="NT"
                  label="New Testament"
                  resetFilter={leftPanelResetFilter} // Kept resetFilter prop
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
                ref={scrollContainerRef} // Added ref
                style={{
                  marginTop: "128px",
                  maxHeight: "min(calc(100vh - 230px), 512px)",
                  overflowY: "auto",
                  scrollBehavior: "smooth", // Added smooth scrolling
                }}
              >
                <Tabs.Content value="OT">
                  <Accordion.Root
                    style={
                      fixedItem ? { position: "relative", marginTop: 48 } : {}
                    }
                  >
                    {renderAccordionItems(oldTestamentBooks, "OT")}
                  </Accordion.Root>
                </Tabs.Content>

                <Tabs.Content value="NT">
                  <Accordion.Root
                    style={
                      fixedItem ? { position: "relative", marginTop: 48 } : {}
                    }
                  >
                    {renderAccordionItems(newTestamentBooks, "NT")}
                  </Accordion.Root>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </SelectDropdown.Content>
        </SelectDropdown.Root>

        <VersionDropdown.Root>
          <VersionDropdown.Trigger
            selectedVersion={String(
              bibleVersions.find(
                (version) => version.key === bibleVersionSelected,
              )?.key,
            )}
          />
          <VersionDropdown.Portal
            bibleVersions={bibleVersions}
            version={bibleVersionSelected}
            onVersionSelected={handleBibleVersionSelected}
          />
        </VersionDropdown.Root>
      </div>

      {/* Tablet and Mobile size here */}
      <RadixTabs.Root
        className={styles.responsiveLayout}
        defaultValue="tab1"
        onValueChange={setActiveTab}
      >
        <RadixTabs.List>
          <RadixTabs.Trigger className={`${styles.trigger}`} value="tab1">
            <Icon.OpenedBook className={` ${styles.active}`} />
          </RadixTabs.Trigger>
          <RadixTabs.Trigger className={`${styles.trigger}`} value="tab2">
            <Icon.ChatIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
          <RadixTabs.Trigger className={styles.trigger} value="tab3">
            <Icon.HamburgerIcon className={` ${styles.active}`} />
          </RadixTabs.Trigger>
        </RadixTabs.List>

        <RadixTabs.Content value="tab1">
          <RadixTabs.List>
            <div className={styles.explanationTypesButton}>
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
            <RadixTabs.Trigger className={styles.trigger} value="tab5">
              <Icon.HistoryIcon className={` ${styles.active}`} />
            </RadixTabs.Trigger>
          </RadixTabs.List>
        </RadixTabs.Content>
      </RadixTabs.Root>
    </TestamentControl.Root>
  );
};
