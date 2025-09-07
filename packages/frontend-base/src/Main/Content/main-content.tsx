"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useQueryClient } from "@tanstack/react-query";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { getBookVerse, getExplanation } from "../../api/bible";
import { SignIn } from "../../auth/SignIn";
import { SignUp } from "../../auth/SignUp";
import {
  fetchAllChaptersByBook,
  fetchAllTestaments,
  fetchBookVerse,
  fetchExplanation,
} from "../../hooks/useBible";
import { useChapter } from "../../hooks/useChapter";
import { useConversationManager } from "../../hooks/useConversationManager";
import { useExplanation } from "../../hooks/useExplanation";
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
import { ModalContainer } from "../../modal/ModalContainer";
import { updateSelectedBook } from "../../store/book-selection";
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
import { Settings } from "../../ui/Settings/Settings";
import { Tabs } from "../../ui/Tabs";
import { VerseGrid, useSelectedVerse } from "../../ui/VerseGrid/verse-grid";
import { bibleVersions } from "../../utils/bible-versions";
import { homeOptions } from "../../utils/home-options";
import styles from "./main-content.module.css";

export const MainContent = () => {
  const { session } = userSession();
  const queryClient = useQueryClient();

  const {
    bookId,
    verseId,
    testament,
    explanationType,
    bibleVersion,
    conversationId,
  } = useGetSearchParams();
  const { saveBibleVersionOnURL, saveSearchParams } = useSaveSearchParams();
  const [visibleChapters, setVisibleChapters] = useState<any[]>([]);
  const isAnimating = useRef(false);
  const scrollPositions = useRef(new Map<string, number>());
  const prevChapterKey = useRef<string | null>(null);
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  const { testaments } = fetchAllTestaments();
  const { chapters } = fetchAllChaptersByBook(bookId);
  const { bookVerseData } = fetchBookVerse(
    bookId,
    Number(verseId),
    bibleVersion,
  );
  const { explanation } = fetchExplanation(
    bookId,
    Number(verseId),
    explanationType,
    bibleVersion,
  );

  const { lastRead, startTimer } = useLastRead(
    session,
    explanation?.explanation_id,
  );

  useEffect(() => {
    const savedExplanationType = localStorage.getItem(
      "postLoginExplanationType",
    );
    if (savedExplanationType) {
      saveSearchParams({
        explanationType: savedExplanationType as ExplanationTypeEnum,
      });
      localStorage.removeItem("postLoginExplanationType");
    }
  }, [saveSearchParams]);

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
    resetFilter: leftPanelResetFilter,
    recentlyViewedBooks,
  } = useSelectDropdown(testaments);

  const {
    isOpen: isDropdownOpenBook,
    toggleDropdown: toggleMobileDropdownBook,
    closeDropdown: closeDropdownBook,
  } = useDropdownToggle();

  const book = testaments?.find((item) => {
    return item.b === Number(bookId);
  })?.n;

  useEffect(() => {
    if (book) {
      updateSelectedBook(book);
    }
  }, [book]);

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

  const accordionRef = useRef<HTMLButtonElement>(null);
  const accordionRefVersion = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isDropdownOpenBook && accordionRef.current) {
      if (!accordionRef.current.getAttribute("data-state")?.includes("open")) {
        accordionRef.current.click();
      }
    }
  }, [isDropdownOpenBook]);

  useEffect(() => {
    if (isDropdownOpenVersion && accordionRefVersion.current) {
      if (
        !accordionRefVersion.current
          .getAttribute("data-state")
          ?.includes("open")
      ) {
        accordionRefVersion.current.click();
      }
    }
  }, [isDropdownOpenVersion]);

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
  const mobileScrollContainerRef = useRef<HTMLDivElement>(null);

  const handleBibleVersionSelected = (versionKey: string) => {
    saveBibleVersionOnURL(versionKey);
    setBibleVersionSelected(versionKey);
  };

  const handleValueChange = (value: ExplanationTypeEnum) => {
    saveSearchParams({ explanationType: value });
    queryClient.invalidateQueries({ queryKey: ["explanation"] });
  };

  const { handleNextChapter, handlePreviousChapter } = useChapter();

  useEffect(() => {
    if (bookVerseData && !isAnimating.current) {
      setVisibleChapters([
        { ...bookVerseData, key: `${bookId}-${verseId}`, className: "" },
      ]);
    }
  }, [bookVerseData, bookId, verseId]);

  const handleAnimationEnd = useCallback(() => {
    isAnimating.current = false;
    setVisibleChapters((prev) => {
      if (!prev || prev.length === 0) return prev;
      if (prev.length >= 2) return [prev[prev.length - 1]];
      return prev;
    });
  }, []);

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (isAnimating.current) return;
      const prevVerseId = Number(verseId) - 1;
      if (prevVerseId < 1) return;

      const prevChapterData = queryClient.getQueryData([
        "bookVerse",
        bookId,
        prevVerseId,
        bibleVersion,
      ]);
      if (!prevChapterData) {
        handlePreviousChapter();
        return;
      }

      isAnimating.current = true;
      setVisibleChapters((prev) => {
        const outgoingChapter = {
          ...prev[0],
          className: (styles as any).slideOutRight,
        };
        const incomingChapter = {
          ...(prevChapterData as object),
          key: `${bookId}-${prevVerseId}`,
          className: (styles as any).slideInLeft,
        };
        return [outgoingChapter, incomingChapter];
      });
      setTimeout(() => handlePreviousChapter(), 50);
    },
    onSwipedLeft: () => {
      if (isAnimating.current) return;
      const nextVerseId = Number(verseId) + 1;
      if (!chapters || nextVerseId > chapters) return;

      const nextChapterData = queryClient.getQueryData([
        "bookVerse",
        bookId,
        nextVerseId,
        bibleVersion,
      ]);
      if (!nextChapterData) {
        handleNextChapter(chapters);
        return;
      }

      isAnimating.current = true;
      setVisibleChapters((prev) => {
        const outgoingChapter = {
          ...prev[0],
          className: (styles as any).slideOutLeft,
        };
        const incomingChapter = {
          ...(nextChapterData as object),
          key: `${bookId}-${nextVerseId}`,
          className: (styles as any).slideInRight,
        };
        return [outgoingChapter, incomingChapter];
      });
      setTimeout(() => handleNextChapter(chapters), 50);
    },
    delta: 30,
    swipeDuration: 500,
    preventScrollOnSwipe: false,
    trackTouch: true,
    trackMouse: false,
  });

  const handlePreviousButtonClick = () => {
    if (window.innerWidth < 1024) {
      if (isAnimating.current) return;
      const prevVerseId = Number(verseId) - 1;
      if (prevVerseId < 1) return;

      const prevChapterData = queryClient.getQueryData([
        "bookVerse",
        bookId,
        prevVerseId,
        bibleVersion,
      ]);
      if (!prevChapterData) {
        handlePreviousChapter();
        return;
      }

      isAnimating.current = true;
      setVisibleChapters((prev) => {
        const outgoingChapter = {
          ...prev[0],
          className: (styles as any).slideOutRight,
        };
        const incomingChapter = {
          ...(prevChapterData as object),
          key: `${bookId}-${prevVerseId}`,
          className: (styles as any).slideInLeft,
        };
        return [outgoingChapter, incomingChapter];
      });
      setTimeout(() => handlePreviousChapter(), 50);
    } else {
      handlePreviousChapter();
    }
  };

  const handleNextButtonClick = () => {
    if (window.innerWidth < 1024) {
      if (isAnimating.current) return;
      const nextVerseId = Number(verseId) + 1;
      if (!chapters || nextVerseId > chapters) return;

      const nextChapterData = queryClient.getQueryData([
        "bookVerse",
        bookId,
        nextVerseId,
        bibleVersion,
      ]);
      if (!nextChapterData) {
        handleNextChapter(chapters);
        return;
      }

      isAnimating.current = true;
      setVisibleChapters((prev) => {
        const outgoingChapter = {
          ...prev[0],
          className: (styles as any).slideOutLeft,
        };
        const incomingChapter = {
          ...(nextChapterData as object),
          key: `${bookId}-${nextVerseId}`,
          className: (styles as any).slideInRight,
        };
        return [outgoingChapter, incomingChapter];
      });
      setTimeout(() => handleNextChapter(chapters), 50);
    } else {
      handleNextChapter(chapters);
    }
  };

  const { activeTab, setActiveTab } = useHandleTab();
  const previousTabRef = useRef<string>("explanation");
  const [rightPanelContent, setRightPanelContent] = useState("default");

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const prevActiveTabRef = useRef<string>();
  const lastMobileTabRef = useRef<string | null>(null);
  const prevWidthRef = useRef(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  useEffect(() => {
    if (activeTab !== "book") {
      isAnimating.current = false;
      if (bookVerseData) {
        setVisibleChapters([
          { ...bookVerseData, key: `${bookId}-${verseId}`, className: "" },
        ]);
      }
    }
  }, [activeTab, bookVerseData, bookId, verseId]);

  useEffect(() => {
    if (prevActiveTabRef.current === "menu" && activeTab !== "menu") {
      setRightPanelContent("default");
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const prevWidth = prevWidthRef.current;

      // From mobile to desktop
      if (prevWidth < 1024 && currentWidth >= 1024) {
        lastMobileTabRef.current = activeTabRef.current;
        if (activeTabRef.current === "book") {
          setActiveTab("explanation");
        }
      }

      // From desktop to mobile
      if (prevWidth >= 1024 && currentWidth < 1024) {
        if (lastMobileTabRef.current) {
          setActiveTab(lastMobileTabRef.current);
        } else {
          setActiveTab("book");
        }
      }

      prevWidthRef.current = currentWidth;
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [setActiveTab]);

  const { conversationsHistory, selectConversation, handleChatExists } =
    useConversationManager(session);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const fixedItem = bookId > 0;

  const handleMobileAccordionTriggerClick = useCallback(
    (bookName: string) => {
      const scrollContainer = mobileScrollContainerRef.current;
      if (!scrollContainer) return;

      const accordionTrigger = scrollContainer.querySelector(
        `[data-mobile-accordion-trigger="${bookName}"]`,
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
      const smoothScrollTo = (targetPosition: number, duration = 800) => {
        const startPosition = scrollContainer.scrollTop;
        const distance = targetPosition - startPosition;
        const startTime = performance.now();

        // Ease-out cubic for smoother deceleration
        const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          const easedProgress = easeOutCubic(progress);
          const currentPosition = startPosition + distance * easedProgress;

          scrollContainer.scrollTop = currentPosition;

          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          }
        };

        requestAnimationFrame(animateScroll);
      };

      const measureAndScroll = () => {
        if (!mobileScrollContainerRef.current) return;
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
        const rowsFloat = desiredDelta / rowHeight;
        const fractional = rowsFloat - Math.floor(rowsFloat);
        const snapThreshold = 0.4;
        const rows =
          fractional <= snapThreshold
            ? Math.round(rowsFloat)
            : Math.ceil(rowsFloat);
        const snappedDelta = Math.max(0, rows) * rowHeight;

        let targetScrollTop = Math.min(
          currentScrollTop + snappedDelta,
          targetTopCap,
        );
        targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

        if (Math.abs(targetScrollTop - currentScrollTop) > THRESHOLD) {
          // Use custom smooth scroll instead of browser's "smooth" behavior
          smoothScrollTo(targetScrollTop, 600); // 600ms duration for slower, nicer animation
        }
      };

      setTimeout(() => {
        if (mobileScrollContainerRef.current) {
          // Check if component is still mounted before proceeding
          requestAnimationFrame(measureAndScroll);
        }
      }, 250);
    },
    [fixedItem],
  );

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

  const renderRecentlyViewed = () => {
    const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
    return recentlyViewedBooks
      .filter((id) => Number(id) !== bookId)
      .map((bookId) => {
        const book = allBooks.find((b) => b.b === Number(bookId));
        if (!book) return null;
        return (
          <Accordion.Item value={book.n} key={book.n}>
            <div
              data-accordion-trigger={book.n}
              onClick={() => handleMobileAccordionTriggerClick(book.n)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  handleMobileAccordionTriggerClick(book.n);
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
                onVerseSelect={(bookId, bookName, verse, testament) => {
                  leftPanelHandleVerseSelect(
                    bookId,
                    bookName,
                    verse,
                    testament,
                  );
                  handleMobileVerseSelect(testament || "", bookName, verse);
                  closeDropdownBook();
                }}
                selectedVerse={String(verseId)}
                selectedBook={String(bookId)}
              />
            </Accordion.Content>
          </Accordion.Item>
        );
      });
  };

  const renderSelectedBook = () => {
    const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
    const selectedBook = allBooks.find((book) => book.b === bookId);
    if (!selectedBook || leftPanelDebouncedFilter.trim()) return null;

    return (
      <Accordion.Item value={selectedBook.n} key={selectedBook.n}>
        <div
          data-accordion-trigger={selectedBook.n}
          onClick={() => handleMobileAccordionTriggerClick(selectedBook.n)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              handleMobileAccordionTriggerClick(selectedBook.n);
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

  const selectedBookDetails = [...oldTestamentBooks, ...newTestamentBooks].find(
    (book) => book.b === bookId,
  );

  const [buttonsVisible, setButtonsVisible] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const nextChapterButtonRef = useRef<HTMLButtonElement>(null);
  const prevChapterButtonRef = useRef<HTMLButtonElement>(null);

  const [isNearNext, setIsNearNext] = useState(false);
  const [isNearPrev, setIsNearPrev] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;

      const checkProximity = (
        buttonRef: React.RefObject<HTMLButtonElement>,
        setIsNear: React.Dispatch<React.SetStateAction<boolean>>,
      ) => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const distance = Math.sqrt(
            (e.clientX - centerX) ** 2 + (e.clientY - centerY) ** 2,
          );
          setIsNear(distance < 150);
        } else {
          setIsNear(false);
        }
      };

      checkProximity(nextChapterButtonRef, setIsNearNext);
      checkProximity(prevChapterButtonRef, setIsNearPrev);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    setButtonsVisible(true);

    inactivityTimerRef.current = setTimeout(() => {
      if (!isNearNext && !isNearPrev) {
        setButtonsVisible(false);
      }
    }, 3000);
  }, [isNearNext, isNearPrev]);

  const [scrollableNode, setScrollableNode] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    const scrollState = {
      lastScrollTop: 0,
      lastScrollTime: 0,
      timeoutId: null as NodeJS.Timeout | null,
    };

    const handleScroll = (event: Event) => {
      let scrollTop: number;
      let clientHeight: number;
      let scrollHeight: number;
      const currentTime = performance.now();

      const isWindow =
        event.target === window ||
        event.target === document ||
        event.currentTarget === window;

      if (isWindow) {
        const docEl = document.documentElement;
        scrollTop = window.scrollY || docEl.scrollTop || 0;
        clientHeight = window.innerHeight;
        scrollHeight = docEl.scrollHeight;
      } else {
        const target = event.target as HTMLElement;
        scrollTop = target.scrollTop;
        clientHeight = target.clientHeight;
        scrollHeight = target.scrollHeight;
      }

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const isScrollingDown = scrollTop > scrollState.lastScrollTop;
      const isScrollingUp = scrollTop < scrollState.lastScrollTop;

      if (scrollState.lastScrollTime) {
        const timeDiff = currentTime - scrollState.lastScrollTime;
        const scrollDiff = Math.abs(scrollTop - scrollState.lastScrollTop);
        const speed = (scrollDiff / timeDiff) * 1000;
        if (speed > 1000) {
          resetInactivityTimer();
        }
      }

      if (window.innerWidth < 1024) {
        if (isAtBottom && isScrollingDown) {
          setButtonsVisible(true);
          if (inactivityTimerRef.current)
            clearTimeout(inactivityTimerRef.current);
        } else if (isScrollingUp && !isAtBottom) {
          resetInactivityTimer();
        }
      }

      scrollState.lastScrollTop = scrollTop;
      scrollState.lastScrollTime = currentTime;
    };

    const passiveOptions = { passive: true };
    window.addEventListener("scroll", handleScroll, passiveOptions);
    if (scrollableNode) {
      scrollableNode.addEventListener("scroll", handleScroll, passiveOptions);
    }

    resetInactivityTimer();

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      window.removeEventListener(
        "scroll",
        handleScroll,
        passiveOptions as AddEventListenerOptions,
      );
      if (scrollableNode) {
        scrollableNode.removeEventListener(
          "scroll",
          handleScroll,
          passiveOptions as EventListenerOptions,
        );
      }
    };
  }, [resetInactivityTimer, scrollableNode]);

  useEffect(() => {
    const handleDocumentClick = () => {
      resetInactivityTimer();
    };

    document.addEventListener("click", handleDocumentClick, { passive: true });

    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (bookId && verseId && chapters) {
      const nextChapterVerseId = Number(verseId) + 1;
      const previousChapterVerseId = Number(verseId) - 1;

      if (nextChapterVerseId <= chapters) {
        // Prefetch next chapter's Bible text
        queryClient.prefetchQuery({
          queryKey: ["bookVerse", bookId, nextChapterVerseId, bibleVersion],
          queryFn: () => getBookVerse(bookId, nextChapterVerseId, bibleVersion),
        });

        // Prefetch next chapter's explanation
        queryClient.prefetchQuery({
          queryKey: [
            "explanation",
            bookId,
            nextChapterVerseId,
            explanationType,
            bibleVersion,
          ],
          queryFn: () =>
            getExplanation(
              bookId,
              nextChapterVerseId,
              explanationType,
              bibleVersion,
            ),
        });
      }

      if (previousChapterVerseId > 0) {
        // Prefetch previous chapter's Bible text
        queryClient.prefetchQuery({
          queryKey: ["bookVerse", bookId, previousChapterVerseId, bibleVersion],
          queryFn: () =>
            getBookVerse(bookId, previousChapterVerseId, bibleVersion),
        });

        // Prefetch previous chapter's explanation
        queryClient.prefetchQuery({
          queryKey: [
            "explanation",
            bookId,
            previousChapterVerseId,
            explanationType,
            bibleVersion,
          ],
          queryFn: () =>
            getExplanation(
              bookId,
              previousChapterVerseId,
              explanationType,
              bibleVersion,
            ),
        });
      }
    }
  }, [bookId, verseId, chapters, bibleVersion, explanationType, queryClient]);

  return (
    <>
      <RadixTabs.Root
        className={`${styles.container}`}
        value={activeTab}
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
                    selectedBook={book}
                    selectedVerse={verseIdToString}
                    defaultPlaceholder="Select a Book"
                    isOpen={isDropdownOpenBook}
                    toggleDropdown={() => {
                      toggleMobileDropdownBook();
                      closeDropdownVersion();
                    }}
                    onClose={closeDropdownBook}
                    resetFilter={leftPanelResetFilter}
                  />
                </>
              )}

              {/* Book content */}
              <SelectDropdown.GroupedSelect.GroupedRoot>
                <SelectDropdown.GroupedSelect.GroupedContent
                  isOpen={isDropdownOpenBook}
                >
                  <Accordion.Root type="multiple">
                    <Accordion.Item value="book">
                      <Accordion.GroupedTrigger
                        ref={accordionRef}
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
                              resetFilter={leftPanelResetFilter}
                            />
                            <Tabs.Trigger
                              value={TestamentEnum.NT}
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
                            ref={mobileScrollContainerRef}
                            className={`${styles.contentGroupedTrigger}`}
                            style={{ paddingBottom: "16px" }}
                          >
                            <div
                              className={styles.selectedBook}
                              style={
                                fixedItem
                                  ? { position: "relative", marginTop: 48 }
                                  : {}
                              }
                            >
                              <Accordion.Root type="multiple">
                                {renderSelectedBook()}
                              </Accordion.Root>
                            </div>
                            {!leftPanelDebouncedFilter.trim() && (
                              <>
                                <div className={styles.recentlyViewed}>
                                  <Accordion.Root type="multiple">
                                    {renderRecentlyViewed()}
                                  </Accordion.Root>
                                </div>
                                <div
                                  style={{
                                    padding: "10px 16px 10px 16px",
                                  }}
                                >
                                  <h4
                                    className={styles.recentlyViewedTitle}
                                    style={{ marginBottom: "4px" }}
                                  >
                                    Recently Viewed ^
                                  </h4>
                                </div>
                              </>
                            )}
                            <Tabs.Content value="OT">
                              <Accordion.Root>
                                {leftPanelFilteredBooks
                                  .map((bookName) =>
                                    testaments?.find((t) => t.n === bookName),
                                  )
                                  .filter(
                                    (
                                      book,
                                    ): book is NonNullable<typeof book> => {
                                      if (!book) return false;
                                      if (book.b === bookId) return false;
                                      if (
                                        recentlyViewedBooks.includes(
                                          String(book.b),
                                        )
                                      )
                                        return false;
                                      return leftPanelDebouncedFilter.trim()
                                        ? true
                                        : book.t === "OT";
                                    },
                                  )
                                  .sort((a, b) => a.b - b.b)
                                  .map((book) => {
                                    return (
                                      <Accordion.Item
                                        value={book.n}
                                        key={book.n}
                                      >
                                        <div
                                          data-mobile-accordion-trigger={book.n}
                                          onClick={() =>
                                            handleMobileAccordionTriggerClick(
                                              book.n,
                                            )
                                          }
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === "Enter" ||
                                              event.key === " "
                                            )
                                              handleMobileAccordionTriggerClick(
                                                book.n,
                                              );
                                          }}
                                          role="button"
                                          tabIndex={0}
                                        >
                                          <Accordion.Trigger
                                            label={book.n}
                                            highlightBook={false}
                                          />
                                        </div>
                                        <Accordion.Content>
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
                                                testament || "",
                                                bookName,
                                                verse,
                                              );
                                              closeDropdownBook();
                                            }}
                                            selectedVerse={String(verseId)}
                                            selectedBook={String(bookId)}
                                            testament={book.t}
                                          />
                                        </Accordion.Content>
                                      </Accordion.Item>
                                    );
                                  })}
                              </Accordion.Root>
                            </Tabs.Content>

                            <Tabs.Content value="NT">
                              <Accordion.Root>
                                {leftPanelFilteredBooks
                                  .map((bookName) =>
                                    testaments?.find((t) => t.n === bookName),
                                  )
                                  .filter(
                                    (
                                      book,
                                    ): book is NonNullable<typeof book> => {
                                      if (!book) return false;
                                      if (book.b === bookId) return false;
                                      if (
                                        recentlyViewedBooks.includes(
                                          String(book.b),
                                        )
                                      )
                                        return false;
                                      return leftPanelDebouncedFilter.trim()
                                        ? true
                                        : book.t === "NT";
                                    },
                                  )
                                  .sort((a, b) => a.b - b.b)
                                  .map((book) => {
                                    return (
                                      <Accordion.Item
                                        value={book.n}
                                        key={book.n}
                                      >
                                        <div
                                          data-mobile-accordion-trigger={book.n}
                                          onClick={() =>
                                            handleMobileAccordionTriggerClick(
                                              book.n,
                                            )
                                          }
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === "Enter" ||
                                              event.key === " "
                                            )
                                              handleMobileAccordionTriggerClick(
                                                book.n,
                                              );
                                          }}
                                          role="button"
                                          tabIndex={0}
                                        >
                                          <Accordion.Trigger
                                            label={book.n}
                                            highlightBook={false}
                                          />
                                        </div>
                                        <Accordion.Content>
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
                                              closeDropdownBook();
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
                >
                  <Accordion.Root type="multiple">
                    <Accordion.Item value="bibleVersion">
                      <Accordion.GroupedTrigger
                        ref={accordionRefVersion}
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
              <RadixTabs.Trigger
                className={`${styles.trigger}`}
                value="book"
                onClick={() => {
                  closeDropdownVersion();
                  closeDropdownBook();
                }}
              >
                <Icon.BibleIcon
                  className={`${styles.active} ${styles.iconSize}`}
                />
              </RadixTabs.Trigger>

              <RadixTabs.Trigger
                className={`${styles.trigger}`}
                value="explanation"
                onClick={() => {
                  closeDropdownVersion();
                  closeDropdownBook();
                }}
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

              <button
                type="button"
                className={styles.trigger}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeDropdownVersion();
                  closeDropdownBook();
                  if (activeTab === "menu") {
                    setActiveTab(previousTabRef.current);
                    setRightPanelContent("default"); // Reset content
                  } else {
                    previousTabRef.current = activeTab;
                    setActiveTab("menu");
                  }
                }}
              >
                <Icon.AnimatedHamburgerIcon
                  isOpen={activeTab === "menu"}
                  className={` ${styles.active} ${styles.iconSize}`}
                />
              </button>
            </RadixTabs.List>
          </div>
          <div>
            <RadixTabs.Content value="book">
              <div className={`${styles.bookContainer}`} {...swipeHandlers}>
                {/* 1. Map and render the chapter views */}
                {visibleChapters.map((chapter, index) => {
                  const isLastChapter = index === visibleChapters.length - 1;
                  return (
                    <div
                      key={chapter.key}
                      className={`${styles.bookContent} ${chapter.className}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        zIndex: index + 1,
                      }}
                      onAnimationEnd={
                        index === 0 ? handleAnimationEnd : undefined
                      }
                      ref={(el) => {
                        if (isLastChapter) {
                          setScrollableNode(el);
                          if (el) {
                            const savedPosition = scrollPositions.current.get(
                              chapter.key,
                            );
                            if (savedPosition) {
                              el.scrollTop = savedPosition;
                            }
                            el.onscroll = () => {
                              scrollPositions.current.set(
                                chapter.key,
                                el.scrollTop,
                              );
                            };
                          }
                        }
                      }}
                    >
                      <MainText.Root>
                        <MainText.Content
                          bookId={String(chapter.bookId)}
                          verseId={String(chapter.chapters[0].chapterNumber)}
                          book={chapter}
                        />
                        <div style={{ height: "25px" }} />
                      </MainText.Root>
                    </div>
                  );
                })}

                {/* 2. Render the UI controls separately on top */}
                {chapters && Number(verseId) < chapters && (
                  <button
                    ref={nextChapterButtonRef}
                    type="button"
                    className={`${styles.nextChapterBtn} ${
                      !buttonsVisible && !isNearNext ? styles.hidden : ""
                    }`}
                    onClick={handleNextButtonClick}
                    style={{ zIndex: 10 }}
                  >
                    <Icon.ChevronForward className={styles.chevronForward} />
                  </button>
                )}
                {chapters && Number(verseId) > 1 && (
                  <button
                    ref={prevChapterButtonRef}
                    type="button"
                    className={`${styles.previousChapterBtn} ${
                      !buttonsVisible && !isNearPrev ? styles.hidden : ""
                    }`}
                    onClick={handlePreviousButtonClick}
                    style={{ zIndex: 10 }}
                  >
                    <Icon.ChevronBackward className={styles.chevronBackward} />
                  </button>
                )}

                {/* Progress bar */}
                {bookVerseData && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      width: "100%",
                      zIndex: 10, // Ensure it's on top
                    }}
                  >
                    <ProgressBar.Root>
                      <ProgressBar.IndicatorBackground>
                        <ProgressBar.Indicator value={progress} />
                      </ProgressBar.IndicatorBackground>
                      <ProgressBar.Label value={progress} />
                    </ProgressBar.Root>
                  </div>
                )}
              </div>
            </RadixTabs.Content>

            <RadixTabs.Content value="explanation">
              <Explanation.Container chapters={chapters}>
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
                {rightPanelContent === "settings" ? (
                  <Settings
                    selectedBibleVersion={bibleVersionSelected}
                    setSelectedBibleVersion={handleBibleVersionSelected}
                    setRightPanelContent={setRightPanelContent}
                  />
                ) : session?.id ? (
                  <>
                    <ProfileButton
                      link="/"
                      setRightPanelContent={setRightPanelContent}
                    />
                    <div className={styles.menuOptions}>
                      <Accordion.Root type="multiple">
                        {homeOptions.map((option) => (
                          <Accordion.Item key={option.name} value={option.name}>
                            <Accordion.Trigger
                              label={option.label}
                              icon={option.icon}
                            />
                            <Accordion.Content>
                              {option.content}
                            </Accordion.Content>
                          </Accordion.Item>
                        ))}
                      </Accordion.Root>
                      <Accordion.Root type="multiple">
                        <Accordion.Item value="settings">
                          <div
                            onClick={() => setRightPanelContent("settings")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                setRightPanelContent("settings");
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <Accordion.Trigger
                              label="Settings"
                              icon={<Icon.SettingsIcon />}
                            />
                          </div>
                        </Accordion.Item>
                      </Accordion.Root>
                    </div>
                  </>
                ) : (
                  <>
                    {rightPanelContent === "login" && (
                      <SignIn onSwitch={() => setRightPanelContent("signup")} />
                    )}
                    {rightPanelContent === "signup" && (
                      <SignUp onSwitch={() => setRightPanelContent("login")} />
                    )}
                    {rightPanelContent === "default" && (
                      <LoginCard.Root>
                        <LoginCard.Content
                          setRightPanelContent={setRightPanelContent}
                        />
                      </LoginCard.Root>
                    )}
                  </>
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
              leftPanelResetFilter={leftPanelResetFilter}
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
              recentlyViewedBooks={recentlyViewedBooks}
            />
            <LeftPanel.Content
              bookId={bookId}
              verseId={verseId}
              bookVerseData={bookVerseData}
              handleDesktopSwipe={swipeHandlers}
              progress={progress}
              chapters={chapters}
              buttonsVisible={buttonsVisible}
              onNextChapterClick={handleNextButtonClick}
              onPrevChapterClick={handlePreviousButtonClick}
            />
          </LeftPanel.Root>

          <PanelResizer startResize={startResize} />

          <RightPanel.Root
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            rightPanelContent={rightPanelContent}
            setRightPanelContent={setRightPanelContent}
            style={{
              width: `${rightWidth}%`,
            }}
          >
            <RightPanel.Nav
              activeTab={activeTab}
              askVerseMate={askVerseMate}
              setActiveTab={setActiveTab}
              rightPanelContent={rightPanelContent}
              setRightPanelContent={setRightPanelContent}
            />
            <RightPanel.Content
              conversationsHistory={conversationsHistory}
              explanation={explanation}
              session={session}
              selectConversation={selectConversation}
              askVerseMate={askVerseMate}
              rightPanelContent={rightPanelContent}
              setRightPanelContent={setRightPanelContent}
              selectedBibleVersion={bibleVersionSelected}
              handleBibleVersionSelected={handleBibleVersionSelected}
              handleDesktopSwipe={swipeHandlers}
            />
          </RightPanel.Root>
        </main>
      </div>
      <ModalContainer />
    </>
  );
};
