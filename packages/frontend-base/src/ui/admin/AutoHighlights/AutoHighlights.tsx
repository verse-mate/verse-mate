"use client";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import { testaments } from "../../../utils/testaments";
import { Button } from "../../Button/Button";
import { CheckIcon, ChevronDownIcon } from "../../Icons";
import { SelectDropdown } from "../../SelectDropdown";
import { Table, type TableColumn } from "../../Table/Table";
import styles from "./AutoHighlights.module.css";

interface HighlightTheme {
  theme_id: number;
  name: string;
  color: string;
  description: string | null;
  is_system: boolean;
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface ModelOption {
  value: string;
  label: string;
}

interface EffortOption {
  value: string;
  label: string;
  description: string;
}

const modelOptions: ModelOption[] = [
  { value: "gpt-5", label: "GPT-5 ($1.25/$10.00 per 1M tokens)" },
  { value: "gpt-5-mini", label: "GPT-5 Mini ($0.25/$2.00 per 1M tokens)" },
  { value: "gpt-5-nano", label: "GPT-5 Nano ($0.05/$0.40 per 1M tokens)" },
];

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

export const AutoHighlights = () => {
  // Batch creation form state
  const [model, setModel] = useState<string>("gpt-5-mini");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [processWholeBible, setProcessWholeBible] = useState(true);
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [skipExisting, setSkipExisting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Dropdown states
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [effortDropdownOpen, setEffortDropdownOpen] = useState(false);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);

  // Theme management state
  const [themes, setThemes] = useState<HighlightTheme[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [updatingTheme, setUpdatingTheme] = useState<number | null>(null);

  // Global settings state
  const [defaultRelevance, setDefaultRelevance] = useState<number>(3);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [tempRelevance, setTempRelevance] = useState<number>(3);

  // Fetch themes on mount
  useEffect(() => {
    fetchThemes();
    fetchSettings();
  }, []);

  const fetchThemes = async () => {
    try {
      setLoadingThemes(true);
      setThemesError(null);
      const response = await api.admin["highlight-themes"].all.get();
      if (response.data?.data) {
        const themesWithDates = response.data.data.map((theme: any) => ({
          ...theme,
          created_at: new Date(theme.created_at),
          updated_at: new Date(theme.updated_at),
        }));
        setThemes(themesWithDates);
      }
    } catch (error) {
      setThemesError("Failed to load highlight themes");
      console.error("Failed to fetch themes:", error);
    } finally {
      setLoadingThemes(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoadingSettings(true);
      setSettingsError(null);
      const response =
        await api.admin["auto-highlight-settings"]["default-relevance"].get();
      if (response.data?.data?.default_relevance !== undefined) {
        setDefaultRelevance(response.data.data.default_relevance);
        setTempRelevance(response.data.data.default_relevance);
      }
    } catch (error) {
      setSettingsError("Failed to load settings");
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!processWholeBible && !selectedBook) {
      setCreateError("Please select a book");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);

      const payload = {
        type: processWholeBible ? ("bible" as const) : ("book" as const),
        model,
        effort,
        skipExisting,
        ...(processWholeBible ? {} : { bookName: selectedBook }),
      };

      const response = await api.admin["batch-auto-highlights"].post(payload);

      if (response.data?.success) {
        setCreateSuccess(
          processWholeBible
            ? "Auto-highlight batch creation started for entire Bible. View progress in Batch Operations page."
            : `Auto-highlight batch creation started for ${selectedBook}. View progress in Batch Operations page.`,
        );
        setProcessWholeBible(true);
        setSelectedBook("");
      } else {
        const message =
          (response.data && (response.data as any).message) ||
          "Failed to create auto-highlight batch";
        setCreateError(message);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to create auto-highlight batch";
      setCreateError(message);
      console.error("Failed to create batch:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleTheme = async (themeId: number, currentStatus: boolean) => {
    try {
      setUpdatingTheme(themeId);
      // @ts-expect-error - Dynamic path parameter
      await api.admin["highlight-themes"][themeId].patch({
        is_active: !currentStatus,
      });

      // Update local state
      setThemes((prev) =>
        prev.map((theme) =>
          theme.theme_id === themeId
            ? { ...theme, is_active: !currentStatus }
            : theme,
        ),
      );
    } catch (error) {
      setThemesError("Failed to update theme status");
      console.error("Failed to toggle theme:", error);
    } finally {
      setUpdatingTheme(null);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      setUpdatingSettings(true);
      setSettingsError(null);
      await api.admin["auto-highlight-settings"]["default-relevance"].patch({
        default_relevance: tempRelevance,
      });

      setDefaultRelevance(tempRelevance);
      setCreateSuccess("Default relevance threshold updated successfully");
    } catch (error) {
      setSettingsError("Failed to update settings");
      console.error("Failed to update settings:", error);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const themeColumns: TableColumn<HighlightTheme & { id: string }>[] = [
    {
      title: "Name",
      property: "name",
      className: styles.nameColumn,
      render: (theme) => (
        <div className={styles.themeNameCell}>
          <span
            className={styles.colorBadge}
            style={{
              backgroundColor:
                theme.color === "yellow"
                  ? "#fef08a"
                  : theme.color === "blue"
                    ? "#bfdbfe"
                    : theme.color === "green"
                      ? "#bbf7d0"
                      : theme.color === "orange"
                        ? "#fed7aa"
                        : theme.color === "pink"
                          ? "#fbcfe8"
                          : "#e9d5ff",
            }}
          />
          <span>{theme.name}</span>
        </div>
      ),
    },
    {
      title: "Description",
      property: "description",
      className: styles.descriptionColumn,
      render: (theme) => theme.description || "-",
    },
    {
      title: "Priority",
      property: "priority",
      className: styles.priorityColumn,
    },
    {
      title: "Status",
      property: "is_active",
      className: styles.statusColumn,
      render: (theme) => (
        <span
          className={`${styles.statusBadge} ${theme.is_active ? styles.active : styles.inactive}`}
        >
          {theme.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      title: "Actions",
      property: "theme_id",
      className: styles.actionsColumn,
      render: (theme) => (
        <Button
          variant="outlined"
          onClick={() => handleToggleTheme(theme.theme_id, theme.is_active)}
          loading={updatingTheme === theme.theme_id}
          disabled={updatingTheme !== null}
        >
          {theme.is_active ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  const selectedModelData = modelOptions.find((m) => m.value === model);
  const selectedEffortData = effortOptions.find((e) => e.value === effort);
  const selectedBookData = testaments.find((book) => book.n === selectedBook);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Auto-Highlights Management</h2>
      </div>

      {/* Batch Creation Section */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Create Auto-Highlight Batch</h3>
        <p className={styles.sectionDescription}>
          Generate AI-powered highlights for Bible verses based on thematic
          categories
        </p>

        {createError && <div className={styles.error}>{createError}</div>}
        {createSuccess && <div className={styles.success}>{createSuccess}</div>}

        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.label}>Model</label>
            <SelectDropdown.Root
              open={modelDropdownOpen}
              onOpenChange={setModelDropdownOpen}
              onValueChange={(value) => setModel(value)}
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={selectedModelData?.label || "Select Model"}
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{ width: "var(--radix-select-trigger-width)" }}
              >
                {modelOptions.map((option) => (
                  <SelectDropdown.Item
                    key={option.value}
                    value={option.value}
                    icon={<CheckIcon />}
                  >
                    {option.label}
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>Effort Level</label>
            <SelectDropdown.Root
              open={effortDropdownOpen}
              onOpenChange={setEffortDropdownOpen}
              onValueChange={(value) =>
                setEffort(value as unknown as "low" | "medium" | "high")
              }
            >
              <SelectDropdown.Trigger
                selectedBook={null}
                selectedVerse={null}
                defaultPlaceholder={
                  selectedEffortData?.label || "Select Effort"
                }
                icon={<ChevronDownIcon />}
              />
              <SelectDropdown.Content
                align="start"
                style={{ width: "var(--radix-select-trigger-width)" }}
              >
                {effortOptions.map((option) => (
                  <SelectDropdown.Item
                    key={option.value}
                    value={option.value}
                    icon={<CheckIcon />}
                  >
                    <div>
                      <div>{option.label}</div>
                      <div className={styles.optionDescription}>
                        {option.description}
                      </div>
                    </div>
                  </SelectDropdown.Item>
                ))}
              </SelectDropdown.Content>
            </SelectDropdown.Root>
          </div>

          <div className={styles.formField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={processWholeBible}
                onChange={(e) => setProcessWholeBible(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Process Entire Bible</span>
            </label>
          </div>

          <div className={styles.formField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={skipExisting}
                onChange={(e) => setSkipExisting(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Skip existing books (already generated)</span>
            </label>
          </div>

          {!processWholeBible && (
            <div className={styles.formField}>
              <label className={styles.label}>Select Book</label>
              <SelectDropdown.Root
                open={bookDropdownOpen}
                onOpenChange={setBookDropdownOpen}
                onValueChange={(value) => setSelectedBook(value)}
              >
                <SelectDropdown.Trigger
                  selectedBook={null}
                  selectedVerse={null}
                  defaultPlaceholder={selectedBookData?.n || "Select Book"}
                  icon={<ChevronDownIcon />}
                />
                <SelectDropdown.Content
                  align="start"
                  style={{
                    width: "var(--radix-select-trigger-width)",
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
          )}

          <div className={styles.formActions}>
            <Button
              variant="contained"
              onClick={handleCreateBatch}
              loading={creating}
              disabled={creating}
            >
              Create Batch
            </Button>
          </div>
        </div>
      </section>

      {/* Theme Management Section */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Highlight Themes</h3>
        <p className={styles.sectionDescription}>
          Manage which highlight themes are active and available to users
        </p>

        {themesError && <div className={styles.error}>{themesError}</div>}

        <div className={styles.tableContainer}>
          <Table
            columns={themeColumns}
            data={themes.map((t) => ({ ...t, id: t.theme_id.toString() }))}
            isLoading={loadingThemes}
            zebra
          />
        </div>
      </section>

      {/* Global Settings Section */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Default Settings</h3>
        <p className={styles.sectionDescription}>
          Configure default relevance threshold for logged-out users
        </p>

        {settingsError && <div className={styles.error}>{settingsError}</div>}

        <div className={styles.settingsCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>
                Default Relevance Threshold
              </label>
              <p className={styles.settingDescription}>
                Show highlights with relevance score of {tempRelevance} or lower
                (1 = most relevant, 5 = all highlights)
              </p>
            </div>
            <div className={styles.settingControl}>
              <div className={styles.relevanceSlider}>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={tempRelevance}
                  onChange={(e) => setTempRelevance(Number(e.target.value))}
                  className={styles.slider}
                  disabled={loadingSettings}
                />
                <div className={styles.relevanceLabels}>
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
              </div>
              <Button
                variant="contained"
                onClick={handleUpdateSettings}
                loading={updatingSettings}
                disabled={
                  updatingSettings ||
                  loadingSettings ||
                  tempRelevance === defaultRelevance
                }
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
