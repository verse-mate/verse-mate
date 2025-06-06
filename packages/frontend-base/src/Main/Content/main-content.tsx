"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useQueryClient } from "@tanstack/react-query";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import {
  fetchAllChaptersByBook,
  fetchAllTestaments,
  fetchBookVerse,
  fetchExplanation,
} from "../../hooks/useBible";
import { useConversationManager } from "../../hooks/useConversationManager";
import { useHandleTab } from "../../hooks/useHandleTab";
import { useLastRead } from "../../hooks/useLastRead";
import { useProgressBar } from "../../hooks/useProgressBar";
import { useRating } from "../../hooks/useRating";
import { useResizeHandler } from "../../hooks/useResizeHandler";
import {
  useGetSearchParams,
  useSaveSearchParams,
} from "../../hooks/useSearchParams";
import {
  useArrayFilter,
  useDropdownToggle,
  useSelectDropdown,
} from "../../hooks/useSelectDropdown";
import { userSession } from "../../hooks/userSession";
import { Accordion } from "../../ui/Accordion";
import { Chat } from "../../ui/Chat";
import { Explanation } from "../../ui/Explanation";
import { ProfileButton } from "../../ui/Header/UserProfile/user-profile";
import * as Icon from "../../ui/Icons";
import { LeftPanel } from "../../ui/LeftPanel";
import { LoginCard } from "../../ui/LoginCard";
import { MainText } from "../../ui/MainText";
import { PanelResizer } from "../../ui/PanelResizer/PanelResizer";
import { ProgressBar } from "../../ui/ProgressBar";
import { RightPanel } from "../../ui/RightPanel";
import { SelectDropdown } from "../../ui/SelectDropdown";
import { FilterInput } from "../../ui/SelectDropdown/FilterInput/filter-input";
import { Tabs } from "../../ui/Tabs";
import { VerseGrid, useSelectedVerse } from "../../ui/VerseGrid/verse-grid";
import { bibleVersions } from "../../utils/bible-versions";
import styles from "./main-content.module.css";

export const MainContent = () => {
  const { session } = userSession();
  const queryClient = useQueryClient();

  const {
    bookId,
    verseId,
    testament,
    explanationType,
    bibleVersion = "NASB1995",
    conversationId,
  } = useGetSearchParams();
  const { saveBibleVersionOnURL, saveSearchParams } = useSaveSearchParams();
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  const { testaments } = fetchAllTestaments();
  const { chapters } = fetchAllChaptersByBook(bookId);
  const { bookVerseData } = fetchBookVerse(bookId, Number(verseId));
  const { explanation } = fetchExplanation(
    bookId,
    Number(verseId),
    explanationType,
  );

  const { lastRead, startTimer } = useLastRead(
    session,
    explanation?.explanation_id,
  );

  useEffect(() => {
    if (lastRead?.result && !bookId && !verseId && !testament) {
      saveSearchParams({
        bookId: String(lastRead.result.book_id),
        verseId: String(lastRead.result.chapterNumber),
        testament: lastRead.result.testament,
        explanationType: ExplanationTypeEnum.summary,
      });
    }
  }, [lastRead, bookId, verseId, testament, saveSearchParams]);

  useEffect(() => {
    if (bookId && verseId) {
      // restart the timer whenever `bookId` or `verseId` changes
      startTimer(bookId, Number(verseId));
    }
  }, [bookId, verseId, startTimer]);

  const {
    isOpen: leftPanelIsOpen,
    setIsOpen: leftPanelSetIsOpen,
    selectedBook: leftPanelSelectedBook,
    selectedVerse: leftPanelSelectedVerse,
    selectedTab: leftPanelSelectedTab,
    setSelectedTab,
    filteredBooks: leftPanelFilteredBooks,
    debouncedFilter: leftPanelDebouncedFilter,
    handleChange: leftPanelHandleChange,
    handleTabChange: leftPanelHandleTabChange,
    handleVerseSelect: leftPanelHandleVerseSelect,
  } = useSelectDropdown(testaments);

  const { progress } = useProgressBar({
    totalChapters: chapters,
    currentVerse: Number(verseId),
  });

  const {
    maxRating,
    currentRating,
    hoverRating,
    totalRatings,
    averageRating,
    setRating,
    setHoverRating,
  } = useRating(5, session, bookId, verseId, explanation?.explanation_id);

  const oldTestamentBooks =
    testaments?.filter((testament) => testament.t === TestamentEnum.OT) || [];
  const newTestamentBooks =
    testaments?.filter((testament) => testament.t === TestamentEnum.NT) || [];
  const book = testaments?.find((testament) => testament.b === bookId)?.n;

  const {
    isOpen: isDropdownOpenBook,
    toggleDropdown: toggleMobileDropdownBook,
    closeDropdown: closeDropdownBook,
  } = useDropdownToggle();
  const {
    isOpen: isDropdownOpenVersion,
    toggleDropdown: toggleMobileDropdownVersion,
    closeDropdown: closeDropdownVersion,
  } = useDropdownToggle();

  const { filteredArray: filteredMobileArray } = useArrayFilter(bibleVersions);

  const { handleVerseSelect: handleMobileVerseSelect } = useSelectedVerse();

  const testamentLabelMap: { [key: string]: string } = {
    OT: "Old Testament",
    NT: "New Testament",
  };
  const [selectedTestamentLabel, setSelectedTestamentLabel] = useState("");
  const [selectedBookName, setSelectedBookName] = useState("");
  const [chapterSelected, setChapterSelected] = useState("");
  const [bibleVersionSelected, setBibleVersionSelected] = useState(
    bibleVersion || "NASB1995",
  );

  useEffect(() => {
    if (bookId && verseId && testament) {
      const testamentLabel = testamentLabelMap[testament];
      const bookName = testaments?.find((b) => b.b === bookId)?.n;
      const chapterNumber = verseId;

      if (testamentLabel && bookName) {
        setSelectedTab(testament);
        setSelectedTestamentLabel(testamentLabel);
        setSelectedBookName(bookName);
        setChapterSelected(String(chapterNumber));
      }
    }
    if (bibleVersion) {
      const versionSelected = bibleVersions.find((version) => {
        return version.key === bibleVersion;
      })?.key;

      if (versionSelected) {
        setBibleVersionSelected(versionSelected);
      }
    }
  }, [bookId, verseId, testament, testaments, bibleVersion, setSelectedTab]);
  const contentRefBook = useRef<HTMLDivElement>(null);
  const contentRefVersion = useRef<HTMLDivElement>(null);

  const handleBibleVersionSelected = (versionKey: string) => {
    saveBibleVersionOnURL(versionKey);
    setBibleVersionSelected(versionKey);
  };

  const handleValueChange = (value: ExplanationTypeEnum) => {
    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  const handleNextChapter = () => {
    const totalChapters = chapters;
    const currentChapter = Number(verseId);

    if (totalChapters && currentChapter < totalChapters) {
      saveSearchParams({
        verseId: String(currentChapter + 1),
      });
    }
  };

  const handlePreviousChapter = () => {
    const totalChapters = chapters;
    const currentChapter = Number(verseId);

    if (currentChapter > 1) {
      saveSearchParams({
        verseId: String(currentChapter - 1),
      });
    }
  };

  const handleMobileSwipe = useSwipeable({
    onSwipedRight: () => handlePreviousChapter(),
    onSwipedLeft: () => handleNextChapter(),
  });

  const handleDesktopSwipe = useSwipeable({
    onSwipedRight: () => handlePreviousChapter(),
    onSwipedLeft: () => handleNextChapter(),
  });

  const { activeTab, setActiveTab } = useHandleTab();

  const { conversationsHistory, selectConversation, handleChatExists } =
    useConversationManager(session);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  });

  const handleChat = async () => {
    const chats = await handleChatExists({
      book_id: bookId,
      chapter_number: verseId,
    }).then((data) => data?.chatExists);

    const hasChat = chats?.find(
      (chat) => chat.conversation_id === Number(conversationId),
    );

    if (hasChat) {
      saveSearchParams({ conversationId: String(hasChat.conversation_id) });
    } else {
      saveSearchParams({ conversationId: "newChat" });
    }
  };

  const askVerseMate = process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true";

  const { containerRef, leftWidth, startResize, rightWidth } =
    useResizeHandler();

  const fixedItem = leftPanelFilteredBooks.some(
    (bookName) =>
      oldTestamentBooks.some((t) => t.n === bookName && t.b === bookId) ||
      newTestamentBooks.some((t) => t.n === bookName && t.b === bookId),
  );

  return (
    <>
      <RadixTabs.Root
        className={`${styles.container}`}
        defaultValue="book"
        onValueChange={setActiveTab}
      >
        <div className={`${styles.mobileContent}`}>
          <div className={`${styles.headerWrapper}`}>
            <Icon.VerseMateLogoExtended className={styles.verseMateLogo} />

            <div className={styles.mobileTriggersWrapper}>
              {!book ? (
                <SelectDropdown.GroupedSelect.Skeleton />
              ) : (
                <>
                  {/* Book trigger */}
                  <SelectDropdown.GroupedSelect.GroupedTrigger
                    isOpen={isDropdownOpenBook}
                    toggleDropdown={toggleMobileDropdownBook}
                    onClose={closeDropdownBook}
                    contentRef={contentRefBook}
                    label={`${leftPanelSelectedBook || book} ${verseIdToString}`}
                  />
                </>
              )}

              {/* Version trigger */}
              <SelectDropdown.GroupedSelect.GroupedTrigger
                isOpen={isDropdownOpenVersion}
                toggleDropdown={toggleMobileDropdownVersion}
                onClose={closeDropdownVersion}
                contentRef={contentRefVersion}
                label={String(
                  bibleVersions.find(
                    (version) => version.key === bibleVersionSelected,
                  )?.key,
                )}
              />
              {/* Book content */}
              <SelectDropdown.GroupedSelect.GroupedRoot>
                <SelectDropdown.GroupedSelect.GroupedContent
                  isOpen={isDropdownOpenBook}
                  onClose={closeDropdownBook}
                  contentRef={contentRefBook}
                >
                  <Accordion.Root type="multiple">
                    <Accordion.Item value="book">
                      <Accordion.GroupedTrigger
                        selectedContent={
                          selectedTestamentLabel &&
                          selectedBookName &&
                          chapterSelected
                            ? `${selectedTestamentLabel}, ${selectedBookName}, ${chapterSelected}`
                            : "Select a book"
                        }
                      />

                      <Accordion.Content>
                        <Tabs.Root
                          value={leftPanelSelectedTab}
                          onValueChange={leftPanelHandleTabChange}
                        >
                          <Tabs.List>
                            <Tabs.Trigger
                              value={TestamentEnum.OT}
                              label="Old Testament"
                            />
                            <Tabs.Trigger
                              value={TestamentEnum.NT}
                              label="New Testament"
                            />
                          </Tabs.List>

                          <FilterInput
                            placeholder="Filter Books..."
                            debouncedFilter={leftPanelDebouncedFilter}
                            handleChange={leftPanelHandleChange}
                            filterable
                            position="under"
                          />

                          <div className={`${styles.contentGroupedTrigger}`}>
                            <Tabs.Content value="OT">
                              <Accordion.Root
                                style={
                                  fixedItem
                                    ? { position: "relative", marginTop: 48 }
                                    : {}
                                }
                              >
                                {leftPanelFilteredBooks
                                  .filter((bookName) =>
                                    oldTestamentBooks.some(
                                      (t) => t.n === bookName,
                                    ),
                                  )
                                  .map((bookName) =>
                                    oldTestamentBooks.find(
                                      (t) => t.n === bookName,
                                    ),
                                  )
                                  .sort((a, b) => {
                                    if (a?.b === bookId) return -1;
                                    if (b?.b === bookId) return 1;
                                    return 0;
                                  })
                                  .map((book) => {
                                    if (!book) return null;
                                    return (
                                      <Accordion.Item
                                        value={book.n}
                                        key={book.n}
                                      >
                                        <Accordion.Trigger
                                          label={book.n}
                                          highlightBook={bookId === book.b}
                                        />
                                        <Accordion.Content
                                          styles={
                                            fixedItem
                                              ? {
                                                  position: "relative",
                                                }
                                              : {}
                                          }
                                        >
                                          <VerseGrid
                                            bookId={String(book.b)}
                                            bookName={book.n}
                                            verses={Array.from(
                                              { length: book.c },
                                              (_, i) => (i + 1).toString(),
                                            )}
                                            onVerseSelect={(
                                              bookId,
                                              bookName,
                                              verse,
                                              testament,
                                            ) => {
                                              leftPanelHandleVerseSelect(
                                                bookId,
                                                bookName,
                                                verse,
                                                testament,
                                              );
                                              handleMobileVerseSelect(
                                                testament,
                                                bookName,
                                                verse,
                                              );
                                            }}
                                            selectedBook={String(bookId)}
                                            selectedVerse={String(verseId)}
                                            testament={book.t}
                                          />
                                        </Accordion.Content>
                                      </Accordion.Item>
                                    );
                                  })}
                              </Accordion.Root>
                            </Tabs.Content>

                            <Tabs.Content value="NT">
                              <Accordion.Root
                                style={
                                  fixedItem
                                    ? { position: "relative", marginTop: 48 }
                                    : {}
                                }
                              >
                                {leftPanelFilteredBooks
                                  .filter((bookName) =>
                                    newTestamentBooks.some(
                                      (t) => t.n === bookName,
                                    ),
                                  )
                                  .map((bookName) =>
                                    newTestamentBooks.find(
                                      (t) => t.n === bookName,
                                    ),
                                  )
                                  .sort((a, b) => {
                                    if (a?.b === bookId) return -1;
                                    if (b?.b === bookId) return 1;
                                    return 0;
                                  })
                                  .map((book) => {
                                    if (!book) return null;
                                    return (
                                      <Accordion.Item
                                        value={book.n}
                                        key={book.n}
                                      >
                                        <Accordion.Trigger
                                          label={book.n}
                                          highlightBook={bookId === book.b}
                                        />
                                        <Accordion.Content
                                          styles={
                                            fixedItem
                                              ? {
                                                  position: "relative",
                                                  // marginTop: 48,
                                                }
                                              : {}
                                          }
                                        >
                                          <VerseGrid
                                            testament={book.t}
                                            bookId={String(book.b)}
                                            bookName={book.n}
                                            verses={Array.from(
                                              { length: book.c },
                                              (_, i) => (i + 1).toString(),
                                            )}
                                            onVerseSelect={(
                                              bookId,
                                              bookName,
                                              verse,
                                              testament,
                                            ) => {
                                              leftPanelHandleVerseSelect(
                                                bookId,
                                                bookName,
                                                verse,
                                                testament,
                                              );
                                              handleMobileVerseSelect(
                                                testament || "",
                                                bookName,
                                                verse,
                                              );
                                            }}
                                            selectedVerse={String(verseId)}
                                            selectedBook={String(bookId)}
                                          />
                                        </Accordion.Content>
                                      </Accordion.Item>
                                    );
                                  })}
                              </Accordion.Root>
                            </Tabs.Content>
                          </div>
                        </Tabs.Root>
                      </Accordion.Content>
                    </Accordion.Item>
                  </Accordion.Root>
                </SelectDropdown.GroupedSelect.GroupedContent>
              </SelectDropdown.GroupedSelect.GroupedRoot>
              {/* Version content */}
              <SelectDropdown.GroupedSelect.GroupedRoot>
                <SelectDropdown.GroupedSelect.GroupedContent
                  isOpen={isDropdownOpenVersion}
                  onClose={closeDropdownVersion}
                  contentRef={contentRefVersion}
                >
                  <Accordion.Root type="multiple">
                    <Accordion.Item value="bibleVersion">
                      <Accordion.GroupedTrigger
                        selectedContent={
                          bibleVersions.find(
                            (version) => version.key === bibleVersionSelected,
                          )?.value || "Select a version"
                        }
                      />
                      <Accordion.Content>
                        <div
                          style={{
                            marginTop: "0px",
                            maxHeight: "512px",
                            overflowY: "auto",
                          }}
                        >
                          {filteredMobileArray.map((version) => (
                            <SelectDropdown.GroupedSelect.GroupedItem
                              key={version.key}
                              value={version.value}
                              onClick={() =>
                                handleBibleVersionSelected(version.key)
                              }
                              highlighted={bibleVersionSelected === version.key}
                            />
                          ))}
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  </Accordion.Root>
                </SelectDropdown.GroupedSelect.GroupedContent>
              </SelectDropdown.GroupedSelect.GroupedRoot>
            </div>

            <RadixTabs.List className={`${styles.buttonList}`}>
              <RadixTabs.Trigger className={`${styles.trigger}`} value="book">
                <Icon.BibleIcon
                  className={`${styles.active} ${styles.iconSize}`}
                />
              </RadixTabs.Trigger>

              <RadixTabs.Trigger
                className={`${styles.trigger}`}
                value="explanation"
              >
                <Icon.OpenedBook
                  className={` ${styles.active} ${styles.iconSize}`}
                />
              </RadixTabs.Trigger>

              {askVerseMate && (
                <RadixTabs.Trigger
                  className={`${styles.trigger}`}
                  value="chat"
                  onClick={handleChat}
                >
                  <Icon.ChatIcon
                    className={` ${styles.active} ${styles.iconSize}`}
                  />
                </RadixTabs.Trigger>
              )}

              <RadixTabs.Trigger className={styles.trigger} value="menu">
                <Icon.HamburgerIcon
                  className={` ${styles.active} ${styles.iconSize}`}
                />
              </RadixTabs.Trigger>
            </RadixTabs.List>
          </div>
          <div>
            <RadixTabs.Content value="book">
              <div className={`${styles.bookContainer}`}>
                {bookVerseData && (
                  <div
                    className={`${styles.bookContent}`}
                    {...handleMobileSwipe}
                  >
                    <MainText.Root>
                      <MainText.Content
                        bookId={String(bookId)}
                        verseId={String(verseId)}
                        book={bookVerseData}
                      />
                    </MainText.Root>
                    {chapters && Number(verseId) < chapters && (
                      <button
                        type="button"
                        className={styles.nextChapterBtn}
                        onClick={handleNextChapter}
                      >
                        <Icon.ChevronForward
                          className={styles.chevronForward}
                        />
                      </button>
                    )}
                    {chapters && Number(verseId) > 1 && (
                      <button
                        type="button"
                        className={styles.previousChapterBtn}
                        onClick={handlePreviousChapter}
                      >
                        <Icon.ChevronBackward
                          className={styles.chevronBackward}
                        />
                      </button>
                    )}
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
              </div>
            </RadixTabs.Content>

            <RadixTabs.Content value="explanation">
              <Explanation.Container>
                <Explanation.NavHeader />
                <Explanation.Content />
              </Explanation.Container>
            </RadixTabs.Content>

            {askVerseMate && (
              <>
                <RadixTabs.Content value="chat">
                  {session?.id ? (
                    <>
                      <Chat.Card>
                        <Chat.ChatHeader />
                        <Chat.CardContent />
                      </Chat.Card>
                    </>
                  ) : (
                    <LoginCard.Root>
                      <LoginCard.Content />
                    </LoginCard.Root>
                  )}
                </RadixTabs.Content>

                <RadixTabs.Content value="newChat">
                  <Chat.Card>
                    <Chat.ChatHeader />
                    <Chat.CardContent />
                  </Chat.Card>
                </RadixTabs.Content>

                <RadixTabs.Content value="chatHistory">
                  <Chat.Card>
                    <Chat.ChatHeader />
                    <Chat.CardContent />
                  </Chat.Card>
                </RadixTabs.Content>
              </>
            )}

            <RadixTabs.Content value="menu">
              <div className={styles.moreOptionsContainer}>
                {session?.id ? (
                  <ProfileButton link="/" />
                ) : (
                  <LoginCard.Root>
                    <LoginCard.Content />
                  </LoginCard.Root>
                )}
              </div>
            </RadixTabs.Content>
          </div>
        </div>
      </RadixTabs.Root>

      <div className={styles.desktopContainer}>
        <main ref={containerRef} className={`${styles.main}`}>
          <LeftPanel.Root
            style={{
              width: `${leftWidth}%`,
            }}
          >
            <LeftPanel.Nav
              averageRating={averageRating}
              bibleVersionSelected={bibleVersionSelected}
              bookId={bookId}
              verseId={verseId}
              explanation={explanation}
              currentRating={currentRating}
              explanationType={explanationType}
              handleBibleVersionSelected={handleBibleVersionSelected}
              handleValueChange={handleValueChange}
              maxRating={maxRating}
              totalRatings={totalRatings}
              hoverRating={hoverRating}
              leftPanelDebouncedFilter={leftPanelDebouncedFilter}
              leftPanelFilteredBooks={leftPanelFilteredBooks}
              leftPanelHandleChange={leftPanelHandleChange}
              leftPanelHandleTabChange={leftPanelHandleTabChange}
              leftPanelHandleVerseSelect={leftPanelHandleVerseSelect}
              leftPanelIsOpen={leftPanelIsOpen}
              leftPanelSelectedBook={leftPanelSelectedBook}
              leftPanelSelectedTab={leftPanelSelectedTab}
              leftPanelSelectedVerse={leftPanelSelectedVerse}
              leftPanelSetIsOpen={leftPanelSetIsOpen}
              newTestamentBooks={newTestamentBooks}
              oldTestamentBooks={oldTestamentBooks}
              saveSearchParams={saveSearchParams}
              setActiveTab={setActiveTab}
              setHoverRating={setHoverRating}
              setRating={setRating}
              verseIdToString={verseIdToString}
              book={book}
            />
            <LeftPanel.Content
              bookId={bookId}
              verseId={verseId}
              bookVerseData={bookVerseData}
              handleDesktopSwipe={handleDesktopSwipe}
              handleNextChapter={handleNextChapter}
              handlePreviousChapter={handlePreviousChapter}
              progress={progress}
              chapters={chapters}
            />
          </LeftPanel.Root>

          <PanelResizer startResize={startResize} />

          <RightPanel.Root
            setActiveTab={setActiveTab}
            style={{
              width: `${rightWidth}%`,
            }}
          >
            <RightPanel.Nav activeTab={activeTab} askVerseMate={askVerseMate} />
            <RightPanel.Content
              conversationsHistory={conversationsHistory}
              explanation={explanation}
              session={session}
              selectConversation={selectConversation}
              askVerseMate={askVerseMate}
            />
          </RightPanel.Root>
        </main>
      </div>
    </>
  );
};
