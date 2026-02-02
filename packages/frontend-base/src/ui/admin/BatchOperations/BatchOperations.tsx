"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useRef, useState } from "react";
import { bibleVersions } from "../../../utils/bible-versions";
import { testaments } from "../../../utils/testaments";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import { CheckIcon, ChevronDownIcon } from "../../Icons";
import { Input } from "../../Input/Input";
import { SelectDropdown } from "../../SelectDropdown";
import { Table, type TableColumn } from "../../Table/Table";
import styles from "./BatchOperations.module.css";

interface BatchJob {
  id: string;
  batch_type: string;
  openai_batch_id: string | null;
  status: string;
  created_at: Date;
  actual_cost?: number | null;
  created_by: string;
  book_id?: number | null;
  book_name?: string | null;
  bible_version?: string;
  model?: string;
  explanation_types?: string[];
  total_requests?: number;
  completed_requests?: number;
  failed_requests?: number;
  parent_batch_id?: number | null;
  error_file_content?: string | null;
  source_language_code?: string | null;
  target_language_code?: string | null;
  topic_category?: string | null;
  topic_id?: string | null;
  topic_name?: string | null;
}

interface BatchSummary {
  aggregate_status: string;
  status_progress_text: string;
  total_cost: number;
}

interface ModelOption {
  value: string;
  label: string;
  inputCost: number;
  outputCost: number;
}

const modelOptions: ModelOption[] = [
  {
    value: "gpt-5",
    label: "GPT-5 ($1.25/$10.00 per 1M tokens)",
    inputCost: 1.25,
    outputCost: 10,
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini ($0.25/$2.00 per 1M tokens)",
    inputCost: 0.25,
    outputCost: 2,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano ($0.05/$0.40 per 1M tokens)",
    inputCost: 0.05,
    outputCost: 0.4,
  },
];

interface EffortOption {
  value: string;
  label: string;
  description: string;
}

const effortOptions: EffortOption[] = [
  {
    value: "low",
    label: "Low Effort",
    description: "Faster, less reasoning",
  },
  {
    value: "medium",
    label: "Medium Effort",
    description: "Balanced reasoning (default)",
  },
  {
    value: "high",
    label: "High Effort",
    description: "Slower, more thorough reasoning",
  },
];

const bookOptions = testaments;

const parseChapters = (input: string): number[] | undefined => {
  if (!input.trim()) return undefined;

  const result: number[] = [];
  const parts = input.split(",").map((p) => p.trim());

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part
        .split("-")
        .map((p) => Number.parseInt(p.trim()));
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
      }
    } else {
      const num = Number.parseInt(part);
      if (!Number.isNaN(num)) {
        result.push(num);
      }
    }
  }

  return result.length > 0
    ? Array.from(new Set(result)).sort((a, b) => a - b)
    : undefined;
};

const ChapterSelector = ({
  maxChapters,
  selectedChapters,
  onChange,
  disabled,
}: {
  maxChapters: number;
  selectedChapters: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedSet = new Set(parseChapters(selectedChapters) || []);

  const toggleChapter = (num: number) => {
    const newSet = new Set(selectedSet);
    if (newSet.has(num)) {
      newSet.delete(num);
    } else {
      newSet.add(num);
    }
    const sorted = Array.from(newSet).sort((a, b) => a - b);
    onChange(sorted.join(", "));
  };

  const selectAll = () => {
    const all = Array.from({ length: maxChapters }, (_, i) => i + 1);
    onChange(all.join(", "));
  };

  const clearAll = () => onChange("");

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className={styles.chapterSelector} ref={containerRef}>
      <div
        className={styles.chapterInput}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) =>
          !disabled && handleKeyDown(e, () => setIsOpen(!isOpen))
        }
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={isOpen}
        style={{
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span>{selectedChapters || "Select Chapters..."}</span>
        <ChevronDownIcon />
      </div>
      {isOpen && !disabled && (
        <div className={styles.chapterDropdown}>
          <div className={styles.chapterActions}>
            <span
              onClick={selectAll}
              onKeyDown={(e) => handleKeyDown(e, selectAll)}
              role="button"
              tabIndex={0}
            >
              All
            </span>
            <span
              onClick={clearAll}
              onKeyDown={(e) => handleKeyDown(e, clearAll)}
              role="button"
              tabIndex={0}
            >
              None
            </span>
          </div>
          <div className={styles.chapterGrid}>
            {Array.from({ length: maxChapters }, (_, i) => i + 1).map((num) => (
              <div
                key={num}
                className={`${styles.chapterItem} ${selectedSet.has(num) ? styles.selected : ""}`}
                onClick={() => toggleChapter(num)}
                onKeyDown={(e) => handleKeyDown(e, () => toggleChapter(num))}
                role="button"
                tabIndex={0}
                aria-pressed={selectedSet.has(num)}
              >
                {num}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ActionsMenu = ({
  job,
  monitoringId,
  cancellingId,
  onMonitorBibleBatch,
  onViewBibleDetails,
  onCancelBatch,
  onMonitorBatch,
  onViewBookDetails,
}: {
  job: BatchJob;
  monitoringId: string | null;
  cancellingId: string | null;
  onMonitorBibleBatch: (id: string) => void;
  onViewBibleDetails: (id: string) => void;
  onCancelBatch: (id: string) => void;
  onMonitorBatch: (id: string) => void;
  onViewBookDetails: (id: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const canCancel =
    job.status === "validating" ||
    job.status === "in_progress" ||
    job.status === "finalizing";

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <Button variant="outlined" onClick={() => setIsOpen(!isOpen)}>
        Actions
      </Button>
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "8px",
          }}
        >
          {job.batch_type === "bible" ||
          job.batch_type === "rephrase-bible" ||
          job.batch_type === "translate-bible" ||
          job.batch_type === "topic-explanations-parent" ||
          job.batch_type === "topic-translate-all" ||
          job.batch_type === "auto-highlight-bible" ? (
            <>
              <Button
                variant="outlined"
                onClick={() => onMonitorBibleBatch(job.id)}
                disabled={!!monitoringId && monitoringId === job.id}
              >
                Monitor
              </Button>
              <Button
                variant="outlined"
                onClick={() => onViewBibleDetails(job.id)}
              >
                View Details
              </Button>
              {canCancel && (
                <Button
                  variant="outlined"
                  onClick={() => onCancelBatch(job.id)}
                  disabled={!!cancellingId && cancellingId === job.id}
                >
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outlined"
                onClick={() => onMonitorBatch(job.openai_batch_id || "")}
                disabled={
                  !!monitoringId && monitoringId === (job.openai_batch_id || "")
                }
              >
                Monitor
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  if (job.openai_batch_id) {
                    onViewBookDetails(job.openai_batch_id);
                  }
                }}
                disabled={!job.openai_batch_id}
              >
                View Details
              </Button>
              {canCancel && (
                <Button
                  variant="outlined"
                  onClick={() => onCancelBatch(job.id)}
                  disabled={!!cancellingId && cancellingId === job.id}
                >
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const BatchOperations = () => {
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [summaries, setSummaries] = useState<Record<string, BatchSummary>>({});
  const [listLoading, setListLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitoringId, setMonitoringId] = useState<string | null>(null);

  // Form state
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedBibleVersion, setSelectedBibleVersion] =
    useState<string>("NASB1995");
  const [selectedExplanationTypes, setSelectedExplanationTypes] = useState<
    string[]
  >(["summary", "detailed", "byline"]);
  const [selectedChapters, setSelectedChapters] = useState<string>("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(50000);
  const [skipExistingExplanations, setSkipExistingExplanations] =
    useState(false);
  const [selectedEffort, setSelectedEffort] = useState<string>("medium");

  // Dropdown states
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [effortDropdownOpen, setEffortDropdownOpen] = useState(false);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [_targetVersionDropdownOpen, _setTargetVersionDropdownOpen] =
    useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: string; name: string; nativeName: string }[]
  >([]);
  const [availableBibleLanguages, setAvailableBibleLanguages] = useState<
    { code: string; name: string; nativeName: string }[]
  >([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [languageToConfirm, setLanguageToConfirm] = useState<{
    code: string;
    name: string;
  } | null>(null);

  // Modal 1 (Bible Details) state
  const [bibleDetailsModalOpen, setBibleDetailsModalOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [childJobs, setChildJobs] = useState<BatchJob[]>([]);
  const [childJobsLoading, setChildJobsLoading] = useState(false);

  // Modal 2 (Book Details) state
  const [bookDetailsModalOpen, setBookDetailsModalOpen] = useState(false);
  const [selectedJobDetails, setSelectedJobDetails] = useState<any | null>(
    null,
  );
  const [bookDetailsLoading, setBookDetailsLoading] = useState(false);

  // Modal 3 (Rephrase) state
  const [rephraseModalOpen, setRephraseModalOpen] = useState(false);
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [createConfirmModalOpen, setCreateConfirmModalOpen] = useState(false);
  const [impactPreview, setImpactPreview] = useState<
    { language_code: string; count: number; language_name: string }[]
  >([]);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);

  // Modal 4 (Translate) state
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [customTargetLanguage, setCustomTargetLanguage] = useState("");
  const [sourceLanguageDropdownOpen, setSourceLanguageDropdownOpen] =
    useState(false);
  const [targetLanguageDropdownOpen, setTargetLanguageDropdownOpen] =
    useState(false);

  // Topic batch state
  const [topicBatchModalOpen, setTopicBatchModalOpen] = useState(false);
  const [topicBatchType, setTopicBatchType] = useState<
    "discovery" | "references" | "explanations" | "translate" | null
  >(null);
  const [topicCategory, setTopicCategory] = useState("EVENT");
  const [topicLanguageCode, setTopicLanguageCode] = useState("en");
  const [topicExplanationTypes, setTopicExplanationTypes] = useState<string[]>([
    "summary",
    "byline",
    "detailed",
  ]);
  const [creatingTopicBatch, setCreatingTopicBatch] = useState(false);
  const [topicTranslationType, setTopicTranslationType] = useState<
    "names" | "explanations" | "all"
  >("all");
  const [topicSourceLanguage, setTopicSourceLanguage] = useState("en-US");
  const [topicTargetLanguage, setTopicTargetLanguage] = useState("");
  const [topicSkipExisting, setTopicSkipExisting] = useState(false);
  const [topicsForCategory, setTopicsForCategory] = useState<
    {
      topic_id: string;
      name: string;
      description: string | null;
      sort_order: number | null;
    }[]
  >([]);
  const [selectedTopicForBatch, setSelectedTopicForBatch] = useState<
    string | null
  >(null);
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [includeReferencesInSummary, setIncludeReferencesInSummary] =
    useState(false);
  const [includeReferencesInDetailed, setIncludeReferencesInDetailed] =
    useState(false);

  // Auto-highlight batch state
  const [autoHighlightModalOpen, setAutoHighlightModalOpen] = useState(false);
  const [autoHighlightSkipExisting, setAutoHighlightSkipExisting] =
    useState(false);
  const [creatingAutoHighlight, setCreatingAutoHighlight] = useState(false);

  // Fetch topics when category changes
  useEffect(() => {
    const fetchTopicsForCategory = async () => {
      if (
        topicCategory &&
        (topicBatchType === "references" ||
          topicBatchType === "explanations" ||
          topicBatchType === "translate")
      ) {
        try {
          setLoadingTopics(true);
          // Import the topics API
          const topicsApi = await import("../Topics/topicsAdminApi");
          const topics = await topicsApi.getTopicsByCategory(topicCategory);
          setTopicsForCategory(topics || []);
          setSelectedTopicForBatch(null); // Reset selected topic when category changes
        } catch (error) {
          console.error("Error fetching topics for category:", error);
          setTopicsForCategory([]);
          setSelectedTopicForBatch(null);
        } finally {
          setLoadingTopics(false);
        }
      } else {
        setTopicsForCategory([]);
        setSelectedTopicForBatch(null);
      }
    };

    fetchTopicsForCategory();
  }, [topicCategory, topicBatchType]);

  // Language validation function
  const validateLanguageCode = (code: string): boolean => {
    if (!code || typeof code !== "string") return false;
    const normalized = code.trim();
    const full = normalized.toLowerCase();
    const base = full.split("-")[0];
    try {
      const dnEn = new Intl.DisplayNames(["en"], { type: "language" });
      const nameFull = dnEn.of(full);
      const nameBase = dnEn.of(base);
      return (
        Boolean(nameFull && nameFull !== full) ||
        Boolean(nameBase && nameBase !== base)
      );
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        setError(null); // Clear any previous errors
        const response = await api.bible.languages.get();

        if (!response.data || !Array.isArray(response.data)) {
          throw new Error("Invalid response format from languages API");
        }

        const languages = (
          response.data as {
            language_code: string;
            name: string;
            native_name: string;
          }[]
        ).map((lang) => ({
          code: lang.language_code,
          name: lang.name,
          nativeName: lang.native_name,
        }));

        // Validate that we received proper language objects
        const validLanguages = languages.filter(
          (lang) => lang.code && lang.name && lang.nativeName,
        );

        if (validLanguages.length === 0) {
          throw new Error("No valid languages received from API");
        }

        setAvailableLanguages(validLanguages);
        setAvailableBibleLanguages(validLanguages);
      } catch (error) {
        console.error("Failed to fetch available languages:", error);
        setError(
          "Failed to load available languages. Please try refreshing the page.",
        );

        // Set fallback languages in case of API failure
        const fallbackLanguages = [
          { code: "en", name: "English", nativeName: "English" },
          { code: "es", name: "Spanish", nativeName: "Español" },
          { code: "fr", name: "French", nativeName: "Français" },
        ];
        setAvailableLanguages(fallbackLanguages);
        setAvailableBibleLanguages(fallbackLanguages);
      }
    };

    fetchLanguages();
  }, []);

  const fetchBatchJobsOnly = useCallback(async () => {
    try {
      const response = await api.admin["batch-history"].get({ query: {} });
      if (response.data) {
        const jobs = Array.isArray(response.data)
          ? response.data.map((job) => ({
              ...job,
              id: String(job.id),
              // Ensure created_at is a Date object
              created_at: job.created_at
                ? new Date(job.created_at)
                : new Date(),
            }))
          : [];

        console.log("Fetched batch jobs:", jobs);
        jobs.sort((a, b) => Number(b.id) - Number(a.id));
        setBatchJobs(jobs);

        const parentBatches = jobs.filter(
          (job) =>
            (job.batch_type === "bible" ||
              job.batch_type === "rephrase-bible" ||
              job.batch_type === "translate-bible" ||
              job.batch_type === "topic-explanations-parent" ||
              job.batch_type === "topic-translate-all" ||
              job.batch_type === "auto-highlight-bible") &&
            // Skip failed batches to avoid unnecessary API calls
            job.status !== "failed",
        );
        const newSummaries: Record<string, any> = {};
        for (const batch of parentBatches) {
          try {
            const summaryRes = await (api.admin as any)["batch-summary"][
              batch.id
            ].get();
            newSummaries[batch.id] = summaryRes.data;
          } catch (e) {
            console.error(`Failed to fetch summary for ${batch.id}`, e);
          }
        }
        setSummaries(newSummaries);

        return jobs;
      }
      return [];
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
      return [];
    }
  }, []);

  const fetchBatchJobs = useCallback(async () => {
    try {
      setListLoading(true);
      setError(null);
      await fetchBatchJobsOnly();
    } catch (err) {
      setError("Failed to fetch batch jobs");
      console.error("Error fetching batch jobs:", err);
    } finally {
      setListLoading(false);
    }
  }, [fetchBatchJobsOnly]);

  const [isBibleBatch, setIsBibleBatch] = useState(true);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (regenerateModalOpen && selectedBook) {
      const fetchImpact = async () => {
        setLoadingImpact(true);
        try {
          const chapters = parseChapters(selectedChapters);
          const response = await api.admin["batch-explanations"][
            "impact-preview"
          ].post({
            bookName: selectedBook,
            explanationTypes: selectedExplanationTypes,
            chapters: chapters,
          });
          setImpactPreview(response.data || []);
        } catch (error) {
          console.error("Failed to fetch impact preview", error);
          setImpactPreview([]);
        } finally {
          setLoadingImpact(false);
        }
      };
      fetchImpact();
    } else {
      setImpactPreview([]);
    }
  }, [
    regenerateModalOpen,
    selectedBook,
    selectedChapters,
    selectedExplanationTypes,
  ]);

  const handleCreateBatch = async () => {
    if (!isBibleBatch && selectedBook === null) {
      setError("Please select a book");
      return;
    }

    if (selectedExplanationTypes.length === 0) {
      setError("Please select at least one explanation type");
      return;
    }

    const chapters = !isBibleBatch
      ? parseChapters(selectedChapters)
      : undefined;

    if (!isBibleBatch && chapters && selectedBook) {
      const bookData = bookOptions.find((b) => b.n === selectedBook);
      if (bookData) {
        const invalidChapters = chapters.filter((c) => c < 1 || c > bookData.c);
        if (invalidChapters.length > 0) {
          setError(
            `Invalid chapters for ${selectedBook}: ${invalidChapters.join(", ")}. Max chapters: ${bookData.c}`,
          );
          return;
        }
      }
    }

    try {
      setCreating(true);
      setError(null);
      await api.admin["batch-explanations"].post({
        type: isBibleBatch ? "bible" : "book",
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        bibleVersion: selectedBibleVersion,
        model: selectedModel,
        explanationTypes: selectedExplanationTypes,
        skipExisting: skipExistingExplanations,
        effort: selectedEffort as "low" | "medium" | "high",
        chapters,
        maxOutputTokens,
      });
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to create batch job");
      console.error("Error creating batch job:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleRegenerateBatch = async () => {
    if (!isBibleBatch && selectedBook === null) {
      setError("Please select a book");
      return;
    }

    if (selectedExplanationTypes.length === 0) {
      setError("Please select at least one explanation type");
      return;
    }

    const chapters = !isBibleBatch
      ? parseChapters(selectedChapters)
      : undefined;

    if (!isBibleBatch && chapters && selectedBook) {
      const bookData = bookOptions.find((b) => b.n === selectedBook);
      if (bookData) {
        const invalidChapters = chapters.filter((c) => c < 1 || c > bookData.c);
        if (invalidChapters.length > 0) {
          setError(
            `Invalid chapters for ${selectedBook}: ${invalidChapters.join(", ")}. Max chapters: ${bookData.c}`,
          );
          return;
        }
      }
    }

    try {
      setCreating(true);
      setError(null);
      await api.admin["batch-explanations"].post({
        type: isBibleBatch ? "bible" : "book",
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        bibleVersion: selectedBibleVersion,
        model: selectedModel,
        explanationTypes: selectedExplanationTypes,
        skipExisting: false, // FORCE OVERWRITE for regeneration
        effort: selectedEffort as "low" | "medium" | "high",
        chapters,
        maxOutputTokens,
        batchType: "regenerate-book",
      });
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to create regeneration batch job");
      console.error("Error creating regeneration batch job:", err);
    } finally {
      setCreating(false);
    }
  };

  // Topic batch handlers
  const handleCreateTopicBatch = async () => {
    if (!topicBatchType) {
      setError("Please select a topic batch type");
      return;
    }

    // Validate translation inputs
    if (topicBatchType === "translate") {
      if (!topicTargetLanguage.trim()) {
        setError("Please enter a target language code");
        return;
      }
      if (
        topicTranslationType === "explanations" ||
        topicTranslationType === "all"
      ) {
        if (topicExplanationTypes.length === 0) {
          setError("Please select at least one explanation type");
          return;
        }
      }
    }

    try {
      setCreatingTopicBatch(true);
      setError(null);

      switch (topicBatchType) {
        case "discovery":
          await api.admin["batch-topic-discovery"].post({
            model: selectedModel,
            effort: selectedEffort as "low" | "medium" | "high",
          });
          break;
        case "references":
          await api.admin["batch-topic-references"].post({
            model: selectedModel,
            effort: selectedEffort as "low" | "medium" | "high",
            category: topicCategory, // Pass category
            ...(selectedTopicForBatch && { topicId: selectedTopicForBatch }), // Pass topicId if selected
            skipExisting: topicSkipExisting,
          });
          break;
        case "explanations":
          if (topicExplanationTypes.length === 0) {
            setError("Please select at least one explanation type");
            return;
          }
          await api.admin["batch-topic-explanations"].post({
            model: selectedModel,
            languageCode: topicLanguageCode,
            explanationTypes: topicExplanationTypes,
            effort: selectedEffort as "low" | "medium" | "high",
            category: topicCategory,
            ...(selectedTopicForBatch && { topicId: selectedTopicForBatch }),
            includeReferencesInSummary,
            includeReferencesInDetailed,
            skipExisting: topicSkipExisting,
          });
          break;
        case "translate": {
          // Call the appropriate translation endpoint based on translation type
          const translationPayload = {
            model: selectedModel,
            source_language_code: topicSourceLanguage,
            target_language_code: topicTargetLanguage.trim(),
            skip_existing: topicSkipExisting,
            effort: selectedEffort as "low" | "medium" | "high",
            category: topicCategory,
            ...(selectedTopicForBatch && { topic_id: selectedTopicForBatch }),
          };

          if (topicTranslationType === "names") {
            await api.admin.topics["translate-names"].post(translationPayload);
          } else if (topicTranslationType === "explanations") {
            await api.admin.topics["translate-explanations"].post({
              ...translationPayload,
              explanation_types: topicExplanationTypes,
            });
          } else if (topicTranslationType === "all") {
            await api.admin.topics["translate-all"].post({
              ...translationPayload,
              explanation_types: topicExplanationTypes,
            });
          }
          break;
        }
      }

      await fetchBatchJobs();
      setTopicBatchModalOpen(false);
    } catch (err: any) {
      console.error("Caught frontend error:", err); // Full error object
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        `Failed to create topic ${topicBatchType} batch job`;
      setError(errorMessage);
      console.error(
        `Error creating topic ${topicBatchType} batch job:`,
        err.message,
      );
    } finally {
      setCreatingTopicBatch(false);
    }
  };

  const handleCreateAutoHighlightBatch = async () => {
    if (!isBibleBatch && !selectedBook) {
      setError("Please select a book");
      return;
    }

    try {
      setCreatingAutoHighlight(true);
      setError(null);

      await api.admin["batch-auto-highlights"].post({
        type: isBibleBatch ? "bible" : "book",
        model: selectedModel,
        effort: selectedEffort as "low" | "medium" | "high",
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        skipExisting: autoHighlightSkipExisting,
      });

      await fetchBatchJobs();
      setAutoHighlightModalOpen(false);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to create auto-highlight batch";
      setError(errorMessage);
      console.error("Error creating auto-highlight batch:", err);
    } finally {
      setCreatingAutoHighlight(false);
    }
  };

  const handleRephraseBatch = async () => {
    if (!isBibleBatch && selectedBook === null) {
      setError("Please select a book to rephrase");
      return;
    }

    try {
      setRephrasing(true);
      setError(null);
      await api.admin["batch-rephrase"].post({
        type: isBibleBatch ? "bible" : "book",
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        model: selectedModel,
        effort: selectedEffort as "low" | "medium" | "high",
        bibleVersion: selectedBibleVersion,
        maxOutputTokens,
      });
      await fetchBatchJobs();
      setRephraseModalOpen(false);
    } catch (err) {
      setError("Failed to create rephrase batch job");
      console.error("Error creating rephrase batch job:", err);
    } finally {
      setRephrasing(false);
    }
  };

  const handleTranslateBatch = async () => {
    if (!isBibleBatch && selectedBook === null) {
      setError("Please select a book to translate");
      return;
    }

    const targetCode = customTargetLanguage.trim() || targetLanguage;

    // Enhanced language validation
    if (!validateLanguageCode(targetCode)) {
      setError(
        `Invalid language code: ${targetCode}. Please enter a valid ISO 639-1 language code.`,
      );
      return;
    }

    try {
      const displayName = new Intl.DisplayNames(["en"], { type: "language" });
      const languageName = displayName.of(targetCode);

      if (!languageName || languageName === targetCode) {
        setError(
          `Unsupported language code: ${targetCode}. Please use a supported ISO 639-1 language code.`,
        );
        return;
      }

      setLanguageToConfirm({ code: targetCode, name: languageName });
      setConfirmModalOpen(true);
    } catch (e) {
      setError(
        `Error validating language code: ${targetCode}. Please check the format and try again.`,
      );
      console.error("Language validation error:", e);
    }
  };

  const confirmTranslateBatch = async () => {
    if (!languageToConfirm) {
      setError("No language selected for translation");
      return;
    }

    try {
      setTranslating(true);
      setError(null);

      await api.admin["batch-translate"].post({
        type: isBibleBatch ? "bible" : "book",
        bookName: isBibleBatch ? undefined : selectedBook || undefined,
        model: selectedModel,
        effort: selectedEffort as "low" | "medium" | "high",
        source_language_code: sourceLanguage,
        target_language_code: languageToConfirm.code,
        explanationTypes: selectedExplanationTypes,
        skipExisting: skipExistingExplanations,
        chapters: !isBibleBatch ? parseChapters(selectedChapters) : undefined,
        maxOutputTokens,
      });

      await fetchBatchJobs();
      setTranslateModalOpen(false);
      setConfirmModalOpen(false);
      setLanguageToConfirm(null);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to create translate batch job";
      setError(`Translation batch creation failed: ${errorMessage}`);
      console.error("Error creating translate batch job:", err);
    } finally {
      setTranslating(false);
    }
  };

  const handleMonitorBatch = async (batchId: string) => {
    try {
      setMonitoringId(batchId);
      setError(null);
      await (api.admin.batch as any)[batchId].get();
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to monitor batch job");
      console.error("Error monitoring batch job:", err);
    } finally {
      setMonitoringId(null);
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    try {
      setCancellingId(batchId);
      setError(null);
      await api.admin.batch({ batchJobId: batchId }).delete();

      const job = batchJobs.find((j) => j.id === batchId);
      if (
        job?.batch_type === "bible" ||
        job?.batch_type === "rephrase-bible" ||
        job?.batch_type === "translate-bible" ||
        job?.batch_type === "topic-translate-all" ||
        job?.batch_type === "auto-highlight-bible"
      ) {
        await handleMonitorBibleBatch(batchId);
      } else if (job?.openai_batch_id) {
        await handleMonitorBatch(job.openai_batch_id);
      } else {
        await fetchBatchJobs();
      }
    } catch (err) {
      setError("Failed to cancel batch job");
      console.error("Error cancelling batch job:", err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleViewBibleDetails = async (parentId: string) => {
    setSelectedParentId(parentId);
    setBibleDetailsModalOpen(true);
    setChildJobsLoading(true);
    try {
      const response = await (api.admin as any)["batch-children"][
        parentId
      ].get();
      if (response.data) {
        const jobs = response.data.map((job: any) => ({
          ...job,
          id: String(job.id),
        }));
        jobs.sort((a: BatchJob, b: BatchJob) => Number(b.id) - Number(a.id));
        setChildJobs(jobs);
      }
    } catch (err) {
      setError("Failed to fetch child batch jobs");
      console.error("Error fetching child batch jobs:", err);
    } finally {
      setChildJobsLoading(false);
    }
  };

  const handleViewBookDetails = async (batchId: string) => {
    setSelectedJobDetails(null);
    setBookDetailsModalOpen(true);
    setBookDetailsLoading(true);
    try {
      const response = await (api.admin.batch as any)[batchId].get();
      setSelectedJobDetails(response.data);
    } catch (err) {
      setError("Failed to fetch batch job details");
      console.error("Error fetching batch job details:", err);
    } finally {
      setBookDetailsLoading(false);
    }
  };

  const handleMonitorBibleBatch = async (parentId: string) => {
    try {
      setMonitoringId(parentId);
      await (api.admin as any)["monitor-bible-batch"][parentId].post({});
      if (bibleDetailsModalOpen && selectedParentId === parentId) {
        await handleViewBibleDetails(parentId);
      } else {
        await fetchBatchJobs();
      }
    } catch (err) {
      setError("Failed to monitor Bible batch");
      console.error("Error monitoring Bible batch:", err);
    } finally {
      setMonitoringId(null);
    }
  };

  const handleMonitorAllActive = async () => {
    try {
      setMonitoringId("all");
      await api.admin.batches["monitor-all"].post();
      await fetchBatchJobs();
    } catch (err) {
      setError("Failed to start monitoring all active batches.");
      console.error("Error monitoring all active batches:", err);
    } finally {
      setMonitoringId(null);
    }
  };

  const _refreshAndMonitorAll = useCallback(async () => {
    // Implementation for this will need to be updated to handle bible batches
    await fetchBatchJobs();
  }, [fetchBatchJobs]);

  useEffect(() => {
    fetchBatchJobs();
  }, [fetchBatchJobs]);

  const columns: TableColumn<BatchJob>[] = [
    {
      title: "ID",
      property: "id",
      className: styles.idColumn,
      render: (job) => {
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          if (
            job.batch_type === "bible" ||
            job.batch_type === "rephrase-bible" ||
            job.batch_type === "translate-bible" ||
            job.batch_type === "topic-explanations-parent" ||
            job.batch_type === "topic-translate-all" ||
            job.batch_type === "auto-highlight-bible"
          ) {
            handleViewBibleDetails(job.id);
          } else if (job.openai_batch_id) {
            handleViewBookDetails(job.openai_batch_id);
          }
        };
        return (
          <button
            type="button"
            onClick={handleClick}
            className={styles.nowrapColumn}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              textDecoration: "underline",
              color: "blue",
            }}
          >
            {job.id}
          </button>
        );
      },
    },
    {
      title: "Book/Batch",
      property: "book_name",
      className: styles.bookColumn,
      render: (job) => {
        const isTranslateBibleParent = job.batch_type === "translate-bible";

        let displayText: string;
        if (job.batch_type.startsWith("topic-")) {
          switch (job.batch_type) {
            case "topic-discovery":
              displayText = "Topic Discovery";
              if (job.topic_category && job.topic_category !== "all") {
                displayText += ` (${job.topic_category})`;
              }
              break;
            case "topic-references":
              displayText = job.topic_name || "Topic References";
              if (job.topic_id && !job.topic_name) {
                displayText += " (Single Topic)";
              } else if (job.topic_category && !job.topic_name) {
                displayText += ` (${job.topic_category})`;
              }
              break;
            case "topic-explanations":
              displayText = job.topic_name || "Topic Explanations";
              if (job.topic_id && !job.topic_name) {
                displayText += " (Single Topic)";
              }
              break;
            case "topic-explanations-parent":
              displayText = "Topic Explanations";
              if (job.topic_category && job.topic_category !== "all") {
                displayText += ` (${job.topic_category})`;
              } else {
                displayText += " (All)";
              }
              break;
            case "topic-translate-all":
              displayText = "Topic Translation";
              if (job.topic_category) {
                displayText += ` (${job.topic_category})`;
              }
              if (job.target_language_code) {
                displayText += ` → ${job.target_language_code}`;
              }
              break;
            default:
              displayText = job.book_name || "N/A";
          }
        } else if (
          job.batch_type === "bible" ||
          job.batch_type === "rephrase-bible" ||
          job.batch_type === "translate-bible"
        ) {
          displayText = "Entire Bible";
        } else if (job.batch_type === "auto-highlight-bible") {
          displayText = "Auto-Highlights (All Books)";
        } else if (job.batch_type === "auto-highlight") {
          displayText = job.book_name || "Auto-Highlight";
        } else {
          displayText = job.book_name || "N/A";
        }

        let versionCode = job.bible_version;

        // For translate-bible parent batches, show target language instead of source
        if (isTranslateBibleParent && job.target_language_code) {
          versionCode = job.target_language_code;
        }

        return (
          <span className={styles.nowrapColumn}>
            {displayText}
            {versionCode && versionCode !== "N/A" && (
              <span className={styles.versionBadge}>({versionCode})</span>
            )}
          </span>
        );
      },
    },
    {
      title: "Type",
      property: "batch_type",
      className: styles.typeColumn,
      render: (job) => (
        <span className={styles.nowrapColumn}>{job.batch_type}</span>
      ),
    },
    {
      title: "Status",
      property: "status",
      className: styles.statusColumn,
      render: (job) => {
        const summary = summaries[job.id];
        const isParentBatch =
          job.batch_type === "bible" ||
          job.batch_type === "rephrase-bible" ||
          job.batch_type === "translate-bible" ||
          job.batch_type === "topic-explanations-parent" ||
          job.batch_type === "topic-translate-all" ||
          job.batch_type === "auto-highlight-bible";
        const status =
          isParentBatch && summary ? summary.aggregate_status : job.status;
        const statusText =
          isParentBatch && summary ? summary.status_progress_text : status;

        return (
          <span
            className={`${styles.status} ${styles.nowrapColumn} ${
              (styles as any)[
                status === "in_progress"
                  ? "inProgress"
                  : status === "partial_failure"
                    ? "partialFailure"
                    : status
              ]
            }`}
          >
            {statusText}
          </span>
        );
      },
    },
    {
      title: "Cost",
      property: "actual_cost",
      className: styles.costColumn,
      render: (job) => {
        const summary = summaries[job.id];
        const isParentBatch =
          job.batch_type === "bible" ||
          job.batch_type === "rephrase-bible" ||
          job.batch_type === "translate-bible" ||
          job.batch_type === "topic-translate-all" ||
          job.batch_type === "auto-highlight-bible";
        const cost =
          isParentBatch && summary ? summary.total_cost : job.actual_cost;
        return (
          <span className={styles.nowrapColumn}>
            {typeof cost === "number" ? `$${Number(cost).toFixed(4)}` : "N/A"}
          </span>
        );
      },
    },
    {
      title: "Created",
      property: "created_at",
      className: styles.createdColumn,
      render: (job) => (
        <span className={styles.nowrapColumn}>
          {new Date(job.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: "Actions",
      property: "id",
      className: styles.actionsColumn,
      render: (job) => (
        <ActionsMenu
          job={job}
          monitoringId={monitoringId}
          cancellingId={cancellingId}
          onMonitorBibleBatch={handleMonitorBibleBatch}
          onViewBibleDetails={handleViewBibleDetails}
          onCancelBatch={handleCancelBatch}
          onMonitorBatch={handleMonitorBatch}
          onViewBookDetails={handleViewBookDetails}
        />
      ),
    },
  ];

  const selectedBookData = bookOptions.find((book) => book.n === selectedBook);
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );
  const selectedModelData = modelOptions.find(
    (model) => model.value === selectedModel,
  );
  const selectedEffortData = effortOptions.find(
    (effort) => effort.value === selectedEffort,
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Batch Operations</h2>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Create Batch Form */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <h3>Create New Batch</h3>
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: "bold",
            }}
          >
            <input
              type="checkbox"
              checked={isBibleBatch}
              onChange={(e) => setIsBibleBatch(e.target.checked)}
            />
            Generate for whole Bible
          </label>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Model:
            </label>
            <SelectDropdown.Root
              open={modelDropdownOpen}
              onOpenChange={setModelDropdownOpen}
              onValueChange={(val) => setSelectedModel(val)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedModelData?.label || "Select Model"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content align="start" style={{ width: "400px" }}>
                {modelOptions.map((model) => (
                  <SelectDropdown.Item
                    key={model.value}
                    value={model.value}
                    icon={<CheckIcon />}
                  >
                    {model.label}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Max Tokens:
            </label>
            <Input
              type="number"
              value={maxOutputTokens}
              onChange={(e) =>
                setMaxOutputTokens(Number.parseInt(e.target.value))
              }
              placeholder="e.g. 50000"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Effort Level:
            </label>
            <SelectDropdown.Root
              open={effortDropdownOpen}
              onOpenChange={setEffortDropdownOpen}
              onValueChange={(val) => setSelectedEffort(val)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedEffortData?.label || "Select Effort"
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content align="start" style={{ width: "300px" }}>
                {effortOptions.map((effort) => (
                  <SelectDropdown.Item
                    key={effort.value}
                    value={effort.value}
                    icon={<CheckIcon />}
                  >
                    <div>
                      <div>{effort.label}</div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {effort.description}
                      </div>
                    </div>
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Book:
            </label>
            <SelectDropdown.Root
              open={bookDropdownOpen}
              onOpenChange={setBookDropdownOpen}
              onValueChange={(val) => setSelectedBook(val)}
            >
              <SelectDropdown.Trigger
                disabled={isBibleBatch}
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedBookData?.n || "Select Book"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {testaments.map((book) => (
                  <SelectDropdown.Item
                    key={book.b}
                    value={book.n}
                    icon={<CheckIcon />}
                  >
                    {book.n} ({book.t})
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Bible Version:
            </label>
            <SelectDropdown.Root
              open={versionDropdownOpen}
              onOpenChange={setVersionDropdownOpen}
              onValueChange={(val) => setSelectedBibleVersion(val)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedVersionData?.value || "Select Version"
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{
                  width: "300px",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {bibleVersions.map((version) => (
                  <SelectDropdown.Item
                    key={version.key}
                    value={version.key}
                    icon={<CheckIcon />}
                  >
                    {version.value}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          {!isBibleBatch && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Chapters (Optional):
              </label>
              <ChapterSelector
                maxChapters={selectedBookData?.c || 150}
                selectedChapters={selectedChapters}
                onChange={setSelectedChapters}
                disabled={!selectedBook}
              />
            </div>
          )}
        </div>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Explanation Types:
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                {["summary", "detailed", "byline"].map((type) => (
                  <label
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedExplanationTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedExplanationTypes([
                            ...selectedExplanationTypes,
                            type,
                          ]);
                        } else {
                          setSelectedExplanationTypes(
                            selectedExplanationTypes.filter((t) => t !== type),
                          );
                        }
                      }}
                    />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }} />
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: "bold",
            }}
          >
            <input
              type="checkbox"
              checked={skipExistingExplanations}
              onChange={(e) => setSkipExistingExplanations(e.target.checked)}
            />
            Don't replace existing explanations
          </label>
          <p
            style={{
              fontSize: "14px",
              color: "#666",
              marginTop: "4px",
              marginLeft: "24px",
            }}
          >
            When checked, only generates explanations for chapters that don't
            already have explanations of the selected types.
          </p>
        </div>
        {/* Other form elements... */}
        <div style={{ display: "flex", gap: "10px" }}>
          <Button
            onClick={() => setCreateConfirmModalOpen(true)}
            disabled={
              creating ||
              (!isBibleBatch && selectedBook === null) ||
              selectedExplanationTypes.length === 0
            }
            loading={creating}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            {creating ? "Creating..." : "Create New Batch"}
          </Button>
          <Button
            onClick={() => setRegenerateModalOpen(true)}
            disabled={
              creating ||
              (!isBibleBatch && selectedBook === null) ||
              selectedExplanationTypes.length === 0
            }
            loading={creating}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            Regenerate Content
          </Button>
          <Button
            onClick={() => setRephraseModalOpen(true)}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            Rephrase All Explanations
          </Button>
          <Button
            onClick={() => setTranslateModalOpen(true)}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            Translate All Explanations
          </Button>
          <Button
            onClick={() => setTopicBatchModalOpen(true)}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            Create Topic Batch
          </Button>
          <Button
            onClick={() => setAutoHighlightModalOpen(true)}
            style={{ minWidth: "180px", padding: "8px 16px" }}
          >
            Create Auto-Highlight Batch
          </Button>
        </div>
      </div>

      {/* Auto-Highlight Batch Modal */}
      <Dialog
        open={autoHighlightModalOpen}
        onOpenChange={setAutoHighlightModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Create Auto-Highlight Batch</Dialog.Head>
          <Dialog.Description>
            Generate AI-powered highlights for{" "}
            {isBibleBatch
              ? "the entire Bible"
              : selectedBook || "selected book"}
            .
          </Dialog.Description>

          <div style={{ margin: "20px 0" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "bold",
              }}
            >
              <input
                type="checkbox"
                checked={autoHighlightSkipExisting}
                onChange={(e) => setAutoHighlightSkipExisting(e.target.checked)}
              />
              Skip existing books (already generated)
            </label>
            <p
              style={{
                fontSize: "12px",
                color: "#666",
                marginTop: "4px",
                marginLeft: "24px",
              }}
            >
              If checked, books that already have auto-highlights will be
              skipped.
            </p>
          </div>

          <div
            style={{
              background: "#f9f9f9",
              padding: "15px",
              borderRadius: "4px",
              marginBottom: "20px",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
              Current Settings:
            </h4>
            <ul
              style={{
                margin: 0,
                paddingLeft: "20px",
                fontSize: "13px",
                color: "#555",
              }}
            >
              <li>
                Model:{" "}
                <strong>{selectedModelData?.label || selectedModel}</strong>
              </li>
              <li>
                Effort:{" "}
                <strong>{selectedEffortData?.label || selectedEffort}</strong>
              </li>
              <li>
                Target:{" "}
                <strong>
                  {isBibleBatch
                    ? "Entire Bible"
                    : selectedBook || "No book selected"}
                </strong>
              </li>
            </ul>
            <p style={{ fontSize: "12px", marginTop: "10px", color: "#888" }}>
              (Change these in the main form if needed)
            </p>
          </div>

          <Dialog.Footer>
            <Button
              onClick={() => setAutoHighlightModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAutoHighlightBatch}
              loading={creatingAutoHighlight}
              disabled={!isBibleBatch && !selectedBook}
            >
              {creatingAutoHighlight ? "Creating..." : "Create Batch"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Main Table */}
      <div className={styles.tableContainer}>
        <div style={{ marginBottom: "1rem" }}>
          <Button
            onClick={handleMonitorAllActive}
            disabled={monitoringId === "all"}
            loading={monitoringId === "all"}
          >
            Monitor All Active Batches
          </Button>
        </div>
        <Table
          columns={columns}
          data={batchJobs}
          isLoading={listLoading}
          zebra
        />
      </div>

      {/* Modal 1: Bible Details */}
      <Dialog
        open={bibleDetailsModalOpen}
        onOpenChange={setBibleDetailsModalOpen}
        maxWidth="1200px"
      >
        <Dialog.Content>
          <Dialog.Head>Bible Batch Details</Dialog.Head>
          <Dialog.Description>
            Showing all 66 book batches for parent ID: {selectedParentId}
          </Dialog.Description>
          <Button
            onClick={() => handleMonitorBibleBatch(selectedParentId || "")}
          >
            Refresh Statuses
          </Button>
          <div style={{ marginTop: "20px" }}>
            <Table
              columns={columns} // Reuse the same columns definition
              data={childJobs}
              isLoading={childJobsLoading}
              zebra
            />
          </div>
          <Dialog.Footer>
            <Button onClick={() => setBibleDetailsModalOpen(false)}>
              Close
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Modal 2: Book Details (Raw JSON) */}
      <Dialog
        open={bookDetailsModalOpen}
        onOpenChange={setBookDetailsModalOpen}
        maxWidth="1200px"
      >
        <Dialog.Content>
          <Dialog.Head>Raw Batch Details</Dialog.Head>
          {bookDetailsLoading ? (
            <p>Loading...</p>
          ) : (
            <div>
              <pre
                style={{
                  background: "#f4f4f4",
                  padding: "10px",
                  borderRadius: "4px",
                  maxHeight: "40vh",
                  overflow: "auto",
                }}
              >
                <code>{JSON.stringify(selectedJobDetails, null, 2)}</code>
              </pre>
              {selectedJobDetails?.error_file_content && (
                <div style={{ marginTop: "20px" }}>
                  <h4>Error File Content</h4>
                  <pre
                    style={{
                      background: "#f4f4f4",
                      padding: "10px",
                      borderRadius: "4px",
                      maxHeight: "40vh",
                      overflow: "auto",
                      color: "red",
                    }}
                  >
                    <code>{selectedJobDetails.error_file_content}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
          <Dialog.Footer>
            <Button onClick={() => setBookDetailsModalOpen(false)}>
              Close
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Modal 3: Rephrase Confirmation */}
      <Dialog
        open={rephraseModalOpen}
        onOpenChange={setRephraseModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Rephrase</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to rephrase all active explanations? This will
            create a new batch job and may incur costs.
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => setRephraseModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button onClick={handleRephraseBatch} loading={rephrasing}>
              {rephrasing ? "Starting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Modal 4: Translate Confirmation */}
      <Dialog
        open={translateModalOpen}
        onOpenChange={setTranslateModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Translate</Dialog.Head>
          <Dialog.Description>
            Select the source and target Bible versions for the translation.
          </Dialog.Description>
          <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Source Language:
              </label>
              <SelectDropdown.Root
                open={sourceLanguageDropdownOpen}
                onOpenChange={setSourceLanguageDropdownOpen}
                onValueChange={(val) => setSourceLanguage(val)}
              >
                <SelectDropdown.Trigger
                  selectedBook={null}
                  selectedVerse={null}
                  defaultPlaceholder={
                    availableLanguages.find((v) => v.code === sourceLanguage)
                      ?.name || "Select Language"
                  }
                  icon={<ChevronDownIcon />}
                />
                <SelectDropdown.Content
                  align="start"
                  style={{
                    width: "300px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  {availableLanguages.map((language) => (
                    <SelectDropdown.Item
                      key={language.code}
                      value={language.code}
                      icon={<CheckIcon />}
                    >
                      {language.name} ({language.nativeName})
                    </SelectDropdown.Item>
                  ))}
                </SelectDropdown.Content>
              </SelectDropdown.Root>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Target Language:
              </label>
              <SelectDropdown.Root
                open={targetLanguageDropdownOpen}
                onOpenChange={setTargetLanguageDropdownOpen}
                onValueChange={(val) => setTargetLanguage(val)}
              >
                <SelectDropdown.Trigger
                  selectedBook={null}
                  selectedVerse={null}
                  defaultPlaceholder={
                    availableBibleLanguages.find(
                      (v) => v.code === targetLanguage,
                    )?.name || "Select Language"
                  }
                  icon={<ChevronDownIcon />}
                />
                <SelectDropdown.Content
                  align="start"
                  style={{
                    width: "300px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  {availableBibleLanguages.map((language) => (
                    <SelectDropdown.Item
                      key={language.code}
                      value={language.code}
                      icon={<CheckIcon />}
                    >
                      {language.name} ({language.nativeName})
                    </SelectDropdown.Item>
                  ))}
                </SelectDropdown.Content>
              </SelectDropdown.Root>
            </div>
          </div>
          <div style={{ marginTop: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Or enter a custom target language code (e.g., pt-BR):
            </label>
            <Input
              value={customTargetLanguage}
              onChange={(e) => setCustomTargetLanguage(e.target.value)}
              placeholder="e.g., pt-BR"
            />
          </div>
          <Dialog.Footer>
            <Button
              onClick={() => setTranslateModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button onClick={handleTranslateBatch} loading={translating}>
              {translating ? "Starting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Modal 5: Translate Confirmation */}
      <Dialog
        open={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Translation</Dialog.Head>
          <Dialog.Description>
            Are you sure you want to translate explanations to{" "}
            <strong>
              {languageToConfirm?.name} ({languageToConfirm?.code})
            </strong>
            ?
          </Dialog.Description>
          <Dialog.Footer>
            <Button
              onClick={() => setConfirmModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button onClick={confirmTranslateBatch} loading={translating}>
              {translating ? "Starting..." : "Confirm"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Topic Batch Modal */}
      <Dialog
        open={topicBatchModalOpen}
        onOpenChange={setTopicBatchModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Create Topic Batch</Dialog.Head>
          <Dialog.Description>
            Select the type of topic batch operation you want to create.
          </Dialog.Description>

          <div style={{ margin: "20px 0" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
              }}
            >
              Topic Batch Type:
            </label>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <Button
                variant={
                  topicBatchType === "discovery" ? "contained" : "outlined"
                }
                onClick={() => setTopicBatchType("discovery")}
              >
                Discovery
              </Button>
              <Button
                variant={
                  topicBatchType === "references" ? "contained" : "outlined"
                }
                onClick={() => setTopicBatchType("references")}
              >
                References
              </Button>
              <Button
                variant={
                  topicBatchType === "explanations" ? "contained" : "outlined"
                }
                onClick={() => setTopicBatchType("explanations")}
              >
                Explanations
              </Button>
              <Button
                variant={
                  topicBatchType === "translate" ? "contained" : "outlined"
                }
                onClick={() => setTopicBatchType("translate")}
              >
                Translate
              </Button>
            </div>
          </div>

          {(topicBatchType === "references" ||
            topicBatchType === "explanations" ||
            topicBatchType === "translate") && (
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Topic Category:
              </label>
              <div style={{ position: "relative", zIndex: 1001 }}>
                <SelectDropdown.Root
                  onValueChange={(val) => setTopicCategory(val)}
                >
                  <SelectDropdown.Trigger
                    selectedBook={null}
                    selectedVerse={null}
                    defaultPlaceholder={topicCategory}
                    icon={<ChevronDownIcon />}
                  />
                  <SelectDropdown.Content
                    align="start"
                    style={{
                      width: "300px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    <SelectDropdown.Item value="EVENT" icon={<CheckIcon />}>
                      Events
                    </SelectDropdown.Item>
                    <SelectDropdown.Item value="PROPHECY" icon={<CheckIcon />}>
                      Prophecies
                    </SelectDropdown.Item>
                    <SelectDropdown.Item value="PARABLE" icon={<CheckIcon />}>
                      Parables
                    </SelectDropdown.Item>
                    <SelectDropdown.Item value="THEME" icon={<CheckIcon />}>
                      Themes
                    </SelectDropdown.Item>
                  </SelectDropdown.Content>
                </SelectDropdown.Root>
              </div>
            </div>
          )}

          {(topicBatchType === "references" ||
            topicBatchType === "explanations" ||
            topicBatchType === "translate") && (
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                }}
              >
                Specific Topic (Optional):
              </label>
              <div style={{ position: "relative", zIndex: 1000 }}>
                <SelectDropdown.Root
                  open={topicDropdownOpen}
                  onOpenChange={setTopicDropdownOpen}
                  onValueChange={(selectedValue: string) => {
                    if (selectedValue === "all") {
                      setSelectedTopicForBatch(null);
                    } else {
                      setSelectedTopicForBatch(selectedValue);
                    }
                  }}
                >
                  <SelectDropdown.Trigger
                    selectedBook={null}
                    selectedVerse={null}
                    defaultPlaceholder={
                      selectedTopicForBatch
                        ? topicsForCategory.find(
                            (t) => t.topic_id === selectedTopicForBatch,
                          )?.name || "All topics in category"
                        : "All topics in category"
                    }
                    icon={<ChevronDownIcon />}
                  />
                  <SelectDropdown.Content
                    align="start"
                    style={{
                      width: "300px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    <SelectDropdown.Item value="all" icon={<CheckIcon />}>
                      All topics in category
                    </SelectDropdown.Item>
                    {loadingTopics ? (
                      <SelectDropdown.Item
                        value="loading"
                        icon={<CheckIcon />}
                        disabled
                      >
                        Loading topics...
                      </SelectDropdown.Item>
                    ) : (
                      topicsForCategory
                        .filter(
                          (topic) =>
                            topic.topic_id && topic.topic_id.trim() !== "",
                        )
                        .map((topic) => (
                          <SelectDropdown.Item
                            key={topic.topic_id}
                            value={topic.topic_id}
                            icon={<CheckIcon />}
                          >
                            {topic.name}
                          </SelectDropdown.Item>
                        ))
                    )}
                  </SelectDropdown.Content>
                </SelectDropdown.Root>
              </div>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                Select a specific topic to process only that topic, or "All
                topics in category" to process all topics in the selected
                category.
              </p>
            </div>
          )}

          {topicBatchType === "references" && (
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: "bold",
                }}
              >
                <input
                  type="checkbox"
                  checked={topicSkipExisting}
                  onChange={(e) => setTopicSkipExisting(e.target.checked)}
                />
                Don't generate for existing references
              </label>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
                If checked, only topics without any references will be
                processed. If unchecked, new versions will be created for
                existing topics.
              </p>
            </div>
          )}

          {topicBatchType === "explanations" && (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Language Code:
                </label>
                <Input
                  value={topicLanguageCode}
                  onChange={(e) => setTopicLanguageCode(e.target.value)}
                  placeholder="e.g., en, es, fr"
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Explanation Types:
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  {["summary", "detailed", "byline"].map((type) => (
                    <label
                      key={type}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={topicExplanationTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTopicExplanationTypes([
                              ...topicExplanationTypes,
                              type,
                            ]);
                          } else {
                            setTopicExplanationTypes(
                              topicExplanationTypes.filter((t) => t !== type),
                            );
                          }
                        }}
                      />
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Include References (Context):
                </label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={!topicExplanationTypes.includes("summary")}
                      checked={includeReferencesInSummary}
                      onChange={(e) =>
                        setIncludeReferencesInSummary(e.target.checked)
                      }
                    />
                    Include References in Summary
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={!topicExplanationTypes.includes("detailed")}
                      checked={includeReferencesInDetailed}
                      onChange={(e) =>
                        setIncludeReferencesInDetailed(e.target.checked)
                      }
                    />
                    Include References in Detailed
                  </label>
                  <p style={{ fontSize: "12px", color: "#666" }}>
                    Note: Byline explanations always include references by
                    default.
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "bold",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={topicSkipExisting}
                    onChange={(e) => setTopicSkipExisting(e.target.checked)}
                  />
                  Skip existing explanations
                </label>
                <p
                  style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
                >
                  If checked, only topics without explanations for the selected
                  types/language will be processed. If unchecked, new versions
                  will be generated even if explanations exist.
                </p>
              </div>
            </>
          )}

          {topicBatchType === "translate" && (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Translation Type:
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Button
                    variant={
                      topicTranslationType === "names"
                        ? "contained"
                        : "outlined"
                    }
                    onClick={() => setTopicTranslationType("names")}
                  >
                    Names Only
                  </Button>
                  <Button
                    variant={
                      topicTranslationType === "explanations"
                        ? "contained"
                        : "outlined"
                    }
                    onClick={() => setTopicTranslationType("explanations")}
                  >
                    Explanations Only
                  </Button>
                  <Button
                    variant={
                      topicTranslationType === "all" ? "contained" : "outlined"
                    }
                    onClick={() => setTopicTranslationType("all")}
                  >
                    All (Names + Explanations)
                  </Button>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Source Language Code:
                </label>
                <Input
                  value={topicSourceLanguage}
                  onChange={(e) => setTopicSourceLanguage(e.target.value)}
                  placeholder="e.g., en-US"
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "bold",
                  }}
                >
                  Target Language Code:
                </label>
                <Input
                  value={topicTargetLanguage}
                  onChange={(e) => setTopicTargetLanguage(e.target.value)}
                  placeholder="e.g., es-ES, fr-FR"
                />
              </div>

              {(topicTranslationType === "explanations" ||
                topicTranslationType === "all") && (
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "bold",
                    }}
                  >
                    Explanation Types:
                  </label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {["summary", "detailed", "byline"].map((type) => (
                      <label
                        key={type}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={topicExplanationTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTopicExplanationTypes([
                                ...topicExplanationTypes,
                                type,
                              ]);
                            } else {
                              setTopicExplanationTypes(
                                topicExplanationTypes.filter((t) => t !== type),
                              );
                            }
                          }}
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "bold",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={topicSkipExisting}
                    onChange={(e) => setTopicSkipExisting(e.target.checked)}
                  />
                  Skip existing translations
                </label>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginTop: "4px",
                    marginLeft: "24px",
                  }}
                >
                  When checked, only translates topics that don't already have
                  translations in the target language.
                </p>
              </div>
            </>
          )}

          <Dialog.Footer>
            <Button
              onClick={() => setTopicBatchModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTopicBatch}
              loading={creatingTopicBatch}
              disabled={
                !topicBatchType ||
                (topicBatchType === "explanations" &&
                  topicExplanationTypes.length === 0) ||
                (topicBatchType === "translate" &&
                  !topicTargetLanguage.trim()) ||
                (topicBatchType === "translate" &&
                  (topicTranslationType === "explanations" ||
                    topicTranslationType === "all") &&
                  topicExplanationTypes.length === 0)
              }
            >
              {creatingTopicBatch ? "Creating..." : "Create Batch"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Create Confirmation Modal */}
      <Dialog
        open={createConfirmModalOpen}
        onOpenChange={setCreateConfirmModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Batch Creation</Dialog.Head>
          <Dialog.Description>
            You are about to create a new content generation batch.
          </Dialog.Description>
          <div style={{ margin: "20px 0", fontSize: "14px" }}>
            <p>
              <strong>Settings:</strong>
            </p>
            <ul style={{ paddingLeft: "20px", marginTop: "10px" }}>
              <li>
                <strong>Type:</strong>{" "}
                {isBibleBatch ? "Entire Bible" : `Book: ${selectedBook}`}
              </li>
              {!isBibleBatch && selectedChapters && (
                <li>
                  <strong>Chapters:</strong> {selectedChapters}
                </li>
              )}
              <li>
                <strong>Model:</strong> {selectedModel}
              </li>
              <li>
                <strong>Explanation Types:</strong>{" "}
                {selectedExplanationTypes.join(", ")}
              </li>
              <li>
                <strong>Skip Existing:</strong>{" "}
                {skipExistingExplanations ? "Yes" : "No"}
              </li>
            </ul>
          </div>
          <Dialog.Footer>
            <Button
              onClick={() => setCreateConfirmModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCreateConfirmModalOpen(false);
                handleCreateBatch();
              }}
              loading={creating}
            >
              Confirm Create
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      {/* Regenerate Confirmation Modal */}
      <Dialog
        open={regenerateModalOpen}
        onOpenChange={setRegenerateModalOpen}
        maxWidth="600px"
      >
        <Dialog.Content>
          <Dialog.Head>Confirm Regeneration</Dialog.Head>
          <Dialog.Description>
            You are about to regenerate content.
          </Dialog.Description>
          <div
            style={{
              background: "#fff3cd",
              color: "#856404",
              padding: "15px",
              borderRadius: "4px",
              margin: "20px 0",
              border: "1px solid #ffeeba",
            }}
          >
            <strong>Warning:</strong> This will <u>overwrite</u> any existing
            content for the selected scope.
            <br />
            <br />
            Additionally, if specific chapters are selected, any existing
            translations for those chapters will be automatically queued for
            update.
          </div>
          <div style={{ margin: "20px 0", fontSize: "14px" }}>
            <p>
              <strong>Scope:</strong>
            </p>
            <ul style={{ paddingLeft: "20px", marginTop: "10px" }}>
              <li>
                <strong>Type:</strong>{" "}
                {isBibleBatch ? "Entire Bible" : `Book: ${selectedBook}`}
              </li>
              {!isBibleBatch && selectedChapters && (
                <li>
                  <strong>Chapters:</strong> {selectedChapters}
                </li>
              )}
              <li>
                <strong>Model:</strong> {selectedModel}
              </li>
              <li>
                <strong>Explanation Types:</strong>{" "}
                {selectedExplanationTypes.join(", ")}
              </li>
            </ul>

            <div style={{ marginTop: "20px" }}>
              <p>
                <strong>Auto-Translation Impact:</strong>
              </p>
              {loadingImpact ? (
                <p style={{ color: "#666", fontStyle: "italic" }}>
                  Calculating impact...
                </p>
              ) : impactPreview.length > 0 ? (
                <ul style={{ paddingLeft: "20px", marginTop: "10px" }}>
                  {impactPreview.map((lang) => (
                    <li key={lang.language_code}>
                      <strong>
                        {lang.language_name} ({lang.language_code}):
                      </strong>{" "}
                      {lang.count} items will be regenerated
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  style={{
                    color: "#666",
                    fontStyle: "italic",
                    marginTop: "5px",
                  }}
                >
                  No existing translations found to update for this scope.
                </p>
              )}
            </div>
          </div>
          <Dialog.Footer>
            <Button
              onClick={() => setRegenerateModalOpen(false)}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setRegenerateModalOpen(false);
                handleRegenerateBatch();
              }}
              loading={creating}
              style={{ backgroundColor: "#d32f2f", color: "white" }}
            >
              Confirm Regenerate
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};
