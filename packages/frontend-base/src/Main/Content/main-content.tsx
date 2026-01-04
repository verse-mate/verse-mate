"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { getBookVerse, getExplanation } from "../../api/bible";
import { getTopicDetails } from "../../api/topics";
import { SignIn } from "../../auth/SignIn";
import { SignUp } from "../../auth/SignUp";
import { NotesProvider } from "../../contexts/NotesContext";
import {
  fetchAllChaptersByBook,
  fetchAllTestaments,
  fetchBookVerse,
  fetchExplanation,
} from "../../hooks/useBible";
import { useBookIntroduction } from "../../hooks/useBookIntroduction";
import { useChapter } from "../../hooks/useChapter";
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
import { ModalContainer } from "../../modal/ModalContainer";
import { updateSelectedBook } from "../../store/book-selection";
import { Accordion } from "../../ui/Accordion";
import { BookIntroduction } from "../../ui/BookIntroduction";
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
import { explanationTypes } from "../../utils/commentary-options";
import { homeOptions } from "../../utils/home-options";
import { getTopicBySortOrder } from "../../utils/topic-utils";
import { TopicContent } from "./TopicContent";
import { TopicExplanationContainer } from "./TopicExplanationContainer";
import { TopicView } from "./TopicView";
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
    isViewingTopic,
    showIntro,
  } = useGetSearchParams();

  // Check if we're viewing a topic (special testament value)
  const { saveBibleVersionOnURL, saveSearchParams } = useSaveSearchParams();
  const [visibleChapters, setVisibleChapters] = useState<any[]>([]);
  const isAnimating = useRef(false);
  const verseIdToString = verseId !== 0 ? verseId.toString() : "";

  // Fetch current topic info (name, id) quickly from cache
  const { data: currentTopicInfo } = useQuery({
    queryKey: ["topic-by-category-order", bookId, verseId, bibleVersion],
    queryFn: async () => {
      const topic = await getTopicBySortOrder(
        String(bookId),
        Number(verseId),
        bibleVersion,
      );
      return topic;
    },
    enabled: isViewingTopic && typeof bookId === "string" && !!verseId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Fetch full topic details (explanations, etc.) - this is slower but less critical for UI
  const { data: topicDetails, isLoading: isTopicDetailsLoading } = useQuery({
    queryKey: ["topic-details", currentTopicInfo?.topic_id, bibleVersion],
    queryFn: () => getTopicDetails(currentTopicInfo?.topic_id, bibleVersion),
    enabled: isViewingTopic && !!currentTopicInfo?.topic_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { testaments } = fetchAllTestaments();

  // Only fetch Bible data when NOT viewing topics (to avoid NaN errors)
  const { chapters } = fetchAllChaptersByBook(
    isViewingTopic ? 0 : Number(bookId),
  );
  const { bookVerseData } = fetchBookVerse(
    isViewingTopic ? 0 : Number(bookId),
    isViewingTopic ? 0 : Number(verseId),
    bibleVersion,
  );
  const { explanation } = fetchExplanation(
    isViewingTopic ? 0 : Number(bookId),
    isViewingTopic ? 0 : Number(verseId),
    explanationType,
    bibleVersion,
  );

  const { lastRead, startTimer } = useLastRead(session);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedExplanationType = localStorage.getItem(
      "postLoginExplanationType",
    );
    if (savedExplanationType) {
      saveSearchParams({
        explanationType: savedExplanationType as ExplanationTypeEnum,
      });
      localStorage.removeItem("postLoginExplanationType");
    }

    // Handle post-login redirection based on device type
    const postLoginRedirect = localStorage.getItem("postLoginRedirect");
    if (postLoginRedirect) {
      // Remove the flag first to prevent infinite loops
      localStorage.removeItem("postLoginRedirect");

      // Check if we're on desktop or mobile
      const isDesktop =
        typeof window !== "undefined" && window.innerWidth >= 1024;

      if (postLoginRedirect === "desktop" && isDesktop) {
        // For desktop: set activeTab to "explanation" and close hamburger menu
        setActiveTab("explanation");
        setRightPanelContent("default");
      } else if (postLoginRedirect === "mobile") {
        // For mobile/tablet: ensure we're on the book tab and close hamburger menu
        setActiveTab("book");
        setRightPanelContent("default");
      }
    }

    // Handle post-logout redirection based on device type
    const postLogoutRedirect = localStorage.getItem("postLogoutRedirect");
    if (postLogoutRedirect) {
      // Remove the flag first to prevent infinite loops
      localStorage.removeItem("postLogoutRedirect");

      // Check if we're on desktop or mobile
      const isDesktop =
        typeof window !== "undefined" && window.innerWidth >= 1024;

      if (postLogoutRedirect === "desktop" && isDesktop) {
        // For desktop: set activeTab to "explanation" and close hamburger menu
        setActiveTab("explanation");
        setRightPanelContent("default");
      } else if (postLogoutRedirect === "mobile") {
        // For mobile/tablet: ensure we're on the book tab and close hamburger menu
        setActiveTab("book");
        setRightPanelContent("default");
      }
    }

    // Check if we're in the middle of a post-login redirection
    const redirectTo = localStorage.getItem("redirectTo");

    // Handle redirectTo if it exists and we're not in the middle of a post-login redirection
    if (redirectTo && typeof window !== "undefined") {
      // Parse the redirectTo URL to extract search params
      try {
        const redirectUrl = new URL(redirectTo, window.location.origin);
        const bookId = redirectUrl.searchParams.get("bookId");
        const verseId = redirectUrl.searchParams.get("verseId");
        const testament = redirectUrl.searchParams.get("testament");
        const explanationType = redirectUrl.searchParams.get("explanationType");

        // Save the search params
        const paramsToSave: any = {};
        if (bookId) paramsToSave.bookId = bookId;
        if (verseId) paramsToSave.verseId = verseId;
        if (testament) paramsToSave.testament = testament;
        if (explanationType) paramsToSave.explanationType = explanationType;

        if (Object.keys(paramsToSave).length > 0) {
          saveSearchParams(paramsToSave);
        }

        // Remove the redirectTo from localStorage
        localStorage.removeItem("redirectTo");
      } catch (e) {
        console.error("Error parsing redirectTo URL:", e);
        // Remove the redirectTo from localStorage in case of error
        localStorage.removeItem("redirectTo");
      }
    }

    // Only apply lastRead if we're not in the middle of a post-login redirection
    if (
      !postLoginRedirect &&
      !savedExplanationType &&
      !redirectTo &&
      lastRead?.result &&
      !bookId &&
      !verseId &&
      !testament
    ) {
      saveSearchParams({
        bookId: String(lastRead.result.book_id),
        verseId: String(lastRead.result.chapterNumber),
        testament: lastRead.result.testament,
        explanationType: ExplanationTypeEnum.summary,
      });
    }
  }, [saveSearchParams, lastRead, bookId, verseId, testament]);

  useEffect(() => {
    // Only save last read for Bible chapters, not for topics
    if (bookId && verseId && !isViewingTopic) {
      // restart the timer whenever `bookId` or `verseId` changes
      startTimer(Number(bookId), Number(verseId));
    }
  }, [bookId, verseId, isViewingTopic, startTimer]);

  const {
    isOpen: leftPanelIsOpen,
    setIsOpen: leftPanelSetIsOpen,
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

  useEffect(() => {
    const handleClose = () => closeDropdownBook();
    window.addEventListener("closeDropdownBook", handleClose);
    return () => {
      window.removeEventListener("closeDropdownBook", handleClose);
    };
  }, [closeDropdownBook]);

  const book = Array.isArray(testaments)
    ? testaments.find((item) => {
        return item.b === Number(bookId);
      })?.n
    : undefined;

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
  } = useRating(
    5,
    session,
    Number(bookId),
    verseId,
    explanation?.explanation_id,
  );

  // Book introduction - fetch from API
  const { introduction: introData, markAsViewed } = useBookIntroduction(
    !isViewingTopic && typeof bookId === "number" ? bookId : null,
    "en",
  );

  // Track dismissed intros for this session to prevent re-triggering
  const dismissedIntrosRef = useRef<Set<number>>(new Set());

  // Auto-show intro logic removed per request
  // The intro will only be shown when the user explicitly clicks the "Book Overview" button

  const oldTestamentBooks = useMemo(
    () =>
      (testaments || []).filter(
        (testament) => testament.t === TestamentEnum.OT,
      ),
    [testaments],
  );
  const newTestamentBooks = useMemo(
    () =>
      (testaments || []).filter(
        (testament) => testament.t === TestamentEnum.NT,
      ),
    [testaments],
  );

  const { isOpen: isDropdownOpenVersion, closeDropdown: closeDropdownVersion } =
    useDropdownToggle();

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
  const [activeTopicTab, setActiveTopicTab] = useState("EVENTS");

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
        // Only set tab if testament is a valid TestamentEnum value
        if (testament === TestamentEnum.OT || testament === TestamentEnum.NT) {
          setSelectedTab(testament);
        }
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

  const mobileScrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobileScrollContainerRef.current) {
      mobileScrollContainerRef.current.scrollTop = 0;
    }
  }, []);

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
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
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
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
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
    if (activeTab === "menu") {
      // When switching into the menu tab, apply any pending right panel content
      try {
        const pending = localStorage.getItem("postRightPanelContent");
        if (pending && typeof pending === "string") {
          setRightPanelContent(pending);
          localStorage.removeItem("postRightPanelContent");
        }
      } catch {}
    } else if (prevActiveTabRef.current === "menu" && activeTab !== "menu") {
      // When leaving the menu tab, reset content to default
      setRightPanelContent("default");
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  // Support external requests to open specific right panel content (e.g., from modals)
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const requested = custom.detail;
      if (requested) {
        setRightPanelContent(requested);
        setActiveTab("menu");
      }
    };
    window.addEventListener("openRightPanelContent", handler as EventListener);
    return () => {
      window.removeEventListener(
        "openRightPanelContent",
        handler as EventListener,
      );
    };
  }, [setActiveTab]);

  // Allow external tab switch requests
  useEffect(() => {
    const tabHandler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const tab = custom.detail;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("setActiveTab", tabHandler as EventListener);
    return () => {
      window.removeEventListener("setActiveTab", tabHandler as EventListener);
    };
  }, [setActiveTab]);

  // Fallback: honor pending right panel content from localStorage (set by modals)
  useEffect(() => {
    try {
      const pending = localStorage.getItem("postRightPanelContent");
      if (pending && typeof pending === "string") {
        setRightPanelContent(pending);
        setActiveTab("menu");
        localStorage.removeItem("postRightPanelContent");
      }
    } catch {}
  }, [setActiveTab]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
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
  const fixedItem = Number(bookId) > 0;

  const handleMobileAccordionTriggerClick = useCallback(
    (bookName: string) => {
      // Clear any pending scroll animation
      if (scrollAnimationTimeoutRef.current) {
        clearTimeout(scrollAnimationTimeoutRef.current);
        scrollAnimationTimeoutRef.current = null;
      }

      // Skip scrolling if tour is active
      if (document.body.classList.contains("tour-active")) return;

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

      scrollAnimationTimeoutRef.current = setTimeout(() => {
        if (mobileScrollContainerRef.current) {
          // Check if component is still mounted before proceeding
          requestAnimationFrame(measureAndScroll);
        }
        scrollAnimationTimeoutRef.current = null;
      }, 250);
    },
    [fixedItem],
  );

  useEffect(() => {
    scrollToBottom();
  });

  const handleChat = async () => {
    const chats = await handleChatExists({
      book_id: Number(bookId),
      chapter_number: verseId,
    }).then((data) => data?.chatExists);

    const hasChat =
      Array.isArray(chats) &&
      chats.find((chat) => chat.conversation_id === Number(conversationId));

    if (hasChat) {
      saveSearchParams({ conversationId: String(hasChat.conversation_id) });
    } else {
      saveSearchParams({ conversationId: "newChat" });
    }
  };

  const askVerseMate = process.env.NEXT_PUBLIC_ASK_VERSE_MATE === "true";

  const { containerRef, leftWidth, startResize, rightWidth } =
    useResizeHandler();

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

  const [buttonsVisible, setButtonsVisible] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextChapterButtonRef = useRef<HTMLButtonElement>(null);
  const prevChapterButtonRef = useRef<HTMLButtonElement>(null);
  const scrollAnimationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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

  const [scrollElements, setScrollElements] = useState<Set<HTMLElement>>(
    new Set(),
  );

  const scrollableCallbackRef = useCallback((node: HTMLElement | null) => {
    //console.log("📋 Ref callback called with:", node);
    setScrollElements((prev) => {
      const newSet = new Set(prev);
      if (node) {
        newSet.add(node);
      }
      return newSet;
    });
  }, []);

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
    scrollElements.forEach((element) => {
      element.addEventListener("scroll", handleScroll, passiveOptions);
    });

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
      scrollElements.forEach((element) => {
        element.removeEventListener(
          "scroll",
          handleScroll,
          passiveOptions as EventListenerOptions,
        );
      });
    };
  }, [resetInactivityTimer, scrollElements]);

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
      if (scrollAnimationTimeoutRef.current) {
        clearTimeout(scrollAnimationTimeoutRef.current);
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
          queryKey: [
            "bookVerse",
            Number(bookId),
            nextChapterVerseId,
            bibleVersion,
          ],
          queryFn: () =>
            getBookVerse(Number(bookId), nextChapterVerseId, bibleVersion),
        });

        // Prefetch next chapter's explanation
        queryClient.prefetchQuery({
          queryKey: [
            "explanation",
            Number(bookId),
            nextChapterVerseId,
            explanationType,
            bibleVersion,
          ],
          queryFn: () =>
            getExplanation(
              Number(bookId),
              nextChapterVerseId,
              explanationType,
              bibleVersion,
            ),
        });
      }

      if (previousChapterVerseId > 0) {
        // Prefetch previous chapter's Bible text
        queryClient.prefetchQuery({
          queryKey: [
            "bookVerse",
            Number(bookId),
            previousChapterVerseId,
            bibleVersion,
          ],
          queryFn: () =>
            getBookVerse(Number(bookId), previousChapterVerseId, bibleVersion),
        });

        // Prefetch previous chapter's explanation
        queryClient.prefetchQuery({
          queryKey: [
            "explanation",
            Number(bookId),
            previousChapterVerseId,
            explanationType,
            bibleVersion,
          ],
          queryFn: () =>
            getExplanation(
              Number(bookId),
              previousChapterVerseId,
              explanationType,
              bibleVersion,
            ),
        });
      }
    }
  }, [bookId, verseId, chapters, bibleVersion, explanationType, queryClient]);

  return (
    <NotesProvider>
      <RadixTabs.Root
        className={`${styles.container}`}
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <div className={`${styles.mobileContent}`}>
          <div
            className={`${styles.headerWrapper} ${activeTab === "explanation" ? styles.showingCommentaryButtons : ""}`}
          >
            <Icon.VerseMateLogoExtended className={styles.verseMateLogo} />

            <div className={styles.mobileTriggersWrapper}>
              {(!isViewingTopic && !book) ||
              (isViewingTopic && isTopicDetailsLoading) ? (
                <SelectDropdown.GroupedSelect.Skeleton />
              ) : (
                <>
                  {/* Book trigger */}
                  <SelectDropdown.GroupedSelect.GroupedTrigger
                    selectedBook={
                      isViewingTopic
                        ? currentTopicInfo?.name ??
                          topicDetails?.topic?.name ??
                          "Topic"
                        : book ?? null
                    }
                    selectedVerse={isViewingTopic ? "" : verseIdToString}
                    defaultPlaceholder="Select a Book"
                    isOpen={isDropdownOpenBook}
                    toggleDropdown={() => {
                      toggleMobileDropdownBook();
                      closeDropdownVersion();
                    }}
                    onClose={closeDropdownBook}
                    resetFilter={leftPanelResetFilter}
                    dataTour="mobile-book-selector"
                  />
                </>
              )}

              {/* Book content */}
              <SelectDropdown.GroupedSelect.GroupedRoot>
                <SelectDropdown.GroupedSelect.GroupedContent
                  isOpen={isDropdownOpenBook}
                  onClose={closeDropdownBook}
                >
                  <Accordion.Root type="multiple" defaultValue={["book"]}>
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
                        disabled={true}
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
                            ref={mobileScrollContainerRef}
                            className={`${styles.contentGroupedTrigger}`}
                            style={{
                              paddingBottom:
                                leftPanelSelectedTab === "TOPICS"
                                  ? "0px"
                                  : "16px",
                            }}
                          >
                            <Tabs.Content value="OT">
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
                              <Accordion.Root>
                                {/* Recently viewed books (all testaments) */}
                                {!leftPanelDebouncedFilter.trim() &&
                                  recentlyViewedBooks
                                    .filter((id) => Number(id) !== bookId)
                                    .map((bookId) => {
                                      const book = [
                                        ...oldTestamentBooks,
                                        ...newTestamentBooks,
                                      ].find((b) => b.b === Number(bookId));
                                      if (!book) return null;
                                      return (
                                        <Accordion.Item
                                          value={book.n}
                                          key={`recently-${book.n}`}
                                        >
                                          <div
                                            data-mobile-accordion-trigger={
                                              book.n
                                            }
                                            data-tour-john={
                                              book.n === "John" ? "" : undefined
                                            }
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
                                    })
                                    .filter(Boolean)}
                                {/* Regular OT books */}
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
                                          data-tour-john={
                                            book.n === "John" ? "" : undefined
                                          }
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
                              <Accordion.Root>
                                {/* Recently viewed books (all testaments) */}
                                {!leftPanelDebouncedFilter.trim() &&
                                  recentlyViewedBooks
                                    .filter((id) => Number(id) !== bookId)
                                    .map((bookId) => {
                                      const book = [
                                        ...oldTestamentBooks,
                                        ...newTestamentBooks,
                                      ].find((b) => b.b === Number(bookId));
                                      if (!book) return null;
                                      return (
                                        <Accordion.Item
                                          value={book.n}
                                          key={`recently-${book.n}`}
                                        >
                                          <div
                                            data-mobile-accordion-trigger={
                                              book.n
                                            }
                                            data-tour-john={
                                              book.n === "John" ? "" : undefined
                                            }
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
                                    })
                                    .filter(Boolean)}
                                {/* Regular NT books */}
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
                                          data-tour-john={
                                            book.n === "John" ? "" : undefined
                                          }
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
                            <Tabs.Content value="TOPICS">
                              <button
                                type="button"
                                onClick={() => leftPanelHandleTabChange("NT")}
                                className={styles.backButton}
                              >
                                <Icon.ChevronBackward
                                  className={styles.backButtonIcon}
                                />
                                <span>Back to Books</span>
                              </button>
                              <Tabs.Root
                                value={activeTopicTab}
                                onValueChange={setActiveTopicTab}
                              >
                                <Tabs.List>
                                  <Tabs.Trigger value="EVENTS" label="Events" />
                                  <Tabs.Trigger
                                    value="PROPHECIES"
                                    label="Prophecies"
                                  />
                                  <Tabs.Trigger
                                    value="PARABLES"
                                    label="Parables"
                                  />
                                  <Tabs.Trigger value="THEMES" label="Themes" />
                                </Tabs.List>
                                <TopicContent
                                  category={activeTopicTab}
                                  filter={leftPanelDebouncedFilter}
                                />
                              </Tabs.Root>
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

            {/* Tablet-only commentary type buttons in header */}
            <div
              className={`${styles.headerCommentaryButtons} ${activeTab === "explanation" ? styles.visible : styles.hidden}`}
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

            <RadixTabs.List
              className={`${styles.buttonList}`}
              data-tour="mobile-tabs"
            >
              <RadixTabs.Trigger
                className={`${styles.trigger}`}
                value="book"
                data-tour="mobile-book-tab"
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
                data-tour="mobile-explanation-tab"
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
                data-tour="mobile-menu-button"
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
                {isViewingTopic ? (
                  // Show topic view when viewing a topic
                  // bookId = category (EVENTS, PROPHECIES, PARABLES)
                  // verseId = sort_order (1, 2, 3...)
                  <TopicView
                    category={String(bookId)}
                    sortOrder={Number(verseId)}
                    buttonsVisible={buttonsVisible}
                    scrollableCallbackRef={scrollableCallbackRef}
                  />
                ) : showIntro &&
                  typeof bookId === "number" &&
                  introData &&
                  introData.book_id === bookId ? (
                  // Show book introduction
                  (() => {
                    // Read verseId directly from URL to avoid React state timing issues
                    const urlParams = new URLSearchParams(
                      window.location.search,
                    );
                    const currentVerseId = urlParams.get("verseId") || "1";

                    const handleContinue = () => {
                      // Mark as dismissed in this session to prevent re-triggering
                      dismissedIntrosRef.current.add(bookId);

                      // Mark as viewed (updates localStorage immediately to prevent race condition)
                      markAsViewed(bookId, !!session);

                      // Hide intro (preserves current verseId from URL)
                      saveSearchParams({ showIntro: false });
                    };

                    const targetChapter = Number(currentVerseId);

                    return (
                      <BookIntroduction.Root>
                        <BookIntroduction.Content
                          content={introData.full_intro_text}
                        />
                        <BookIntroduction.Actions
                          onContinue={handleContinue}
                          chapterNumber={targetChapter}
                        />
                      </BookIntroduction.Root>
                    );
                  })()
                ) : (
                  // Show normal Bible content
                  <>
                    {/* 1. Map and render the chapter views */}
                    {visibleChapters.map((chapter, index) => {
                      const isLastChapter =
                        index === visibleChapters.length - 1;
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
                          ref={isLastChapter ? scrollableCallbackRef : null}
                        >
                          <MainText.Root>
                            <MainText.Content
                              bookId={String(chapter.bookId)}
                              verseId={String(
                                chapter.chapters[0].chapterNumber,
                              )}
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
                        <Icon.ChevronForward
                          className={styles.chevronForward}
                        />
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
                        <Icon.ChevronBackward
                          className={styles.chevronBackward}
                        />
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
                  </>
                )}
              </div>
            </RadixTabs.Content>

            {/* Use the same explanation system for topics as Bible chapters */}
            <RadixTabs.Content value="explanation">
              {isViewingTopic ? (
                // Show topic explanation using the same system as Bible chapters
                // bookId = category (EVENTS, PROPHECIES, PARABLES)
                // verseId = sort_order (1, 2, 3...)
                <TopicExplanationContainer
                  category={String(bookId)}
                  sortOrder={Number(verseId)}
                />
              ) : (
                // Show normal Bible explanation
                <Explanation.MobileContainer
                  chapters={chapters}
                  explanation={explanation}
                />
              )}
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
              isViewingTopic={isViewingTopic}
              topicDetails={topicDetails}
              averageRating={averageRating}
              bookId={Number(bookId)}
              verseId={verseId}
              explanation={explanation}
              currentRating={currentRating}
              explanationType={explanationType}
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
              isViewingTopic={isViewingTopic}
              topicId={String(bookId)}
              bookVerseData={bookVerseData}
              bookId={Number(bookId)}
              verseId={verseId}
              chapters={chapters}
              progress={progress}
              handleDesktopSwipe={swipeHandlers}
              buttonsVisible={buttonsVisible}
              scrollableCallbackRef={scrollableCallbackRef}
              onNextChapterClick={handleNextButtonClick}
              onPrevChapterClick={handlePreviousButtonClick}
            />{" "}
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
              setActiveTab={setActiveTab}
              setRightPanelContent={setRightPanelContent}
            />
            <RightPanel.Content
              isViewingTopic={isViewingTopic}
              topicId={currentTopicInfo?.topic_id}
              session={session}
              explanation={explanation}
              conversationsHistory={conversationsHistory}
              selectConversation={selectConversation}
              askVerseMate={askVerseMate}
              rightPanelContent={rightPanelContent}
              setRightPanelContent={setRightPanelContent}
              selectedBibleVersion={bibleVersionSelected}
              handleBibleVersionSelected={handleBibleVersionSelected}
              handleDesktopSwipe={swipeHandlers}
            />{" "}
          </RightPanel.Root>
        </main>
      </div>
      <ModalContainer />
    </NotesProvider>
  );
};
