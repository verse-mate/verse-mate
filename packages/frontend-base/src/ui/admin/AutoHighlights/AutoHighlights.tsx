"use client";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import { Button } from "../../Button/Button";
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

export const AutoHighlights = () => {
  // Theme management state
  const [themes, setThemes] = useState<HighlightTheme[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [updatingTheme, setUpdatingTheme] = useState<number | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null); // Kept for global settings update success message

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Auto-Highlights Management</h2>
      </div>

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
