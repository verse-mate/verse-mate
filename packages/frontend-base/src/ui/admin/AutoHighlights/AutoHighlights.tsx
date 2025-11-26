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
  default_relevance_threshold: number;
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
  const [defaultEnabled, setDefaultEnabled] = useState<boolean>(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [updatingEnabled, setUpdatingEnabled] = useState(false);
  const [tempEnabled, setTempEnabled] = useState<boolean>(false);

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

      // Fetch enabled setting
      const enabledResponse =
        await api.admin["auto-highlight-settings"]["default-enabled"].get();
      if (enabledResponse.data?.data?.default_enabled !== undefined) {
        setDefaultEnabled(enabledResponse.data.data.default_enabled);
        setTempEnabled(enabledResponse.data.data.default_enabled);
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

  const handleRelevanceChange = async (
    themeId: number,
    newRelevance: number,
  ) => {
    try {
      // Optimistically update local state
      setThemes((prev) =>
        prev.map((theme) =>
          theme.theme_id === themeId
            ? { ...theme, default_relevance_threshold: newRelevance }
            : theme,
        ),
      );

      // @ts-expect-error - Dynamic path parameter
      await api.admin["highlight-themes"][themeId].patch({
        default_relevance_threshold: newRelevance,
      });

      setCreateSuccess("Theme default relevance updated successfully");
      setTimeout(() => setCreateSuccess(null), 2000);
    } catch (error) {
      setThemesError("Failed to update theme relevance");
      console.error("Failed to update relevance:", error);
      // Revert on error
      fetchThemes();
    }
  };

  const handleUpdateEnabled = async () => {
    try {
      setUpdatingEnabled(true);
      setSettingsError(null);
      await api.admin["auto-highlight-settings"]["default-enabled"].patch({
        default_enabled: tempEnabled,
      });

      setDefaultEnabled(tempEnabled);
      setCreateSuccess("Default auto-highlights setting updated successfully");
    } catch (error) {
      setSettingsError("Failed to update enabled setting");
      console.error("Failed to update enabled setting:", error);
    } finally {
      setUpdatingEnabled(false);
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
      title: "Default Relevance",
      property: "default_relevance_threshold",
      className: styles.relevanceColumn,
      render: (theme) => (
        <div className={styles.relevanceCell}>
          <input
            type="range"
            min="1"
            max="5"
            value={theme.default_relevance_threshold}
            onChange={(e) =>
              handleRelevanceChange(theme.theme_id, Number(e.target.value))
            }
            className={styles.slider}
            disabled={updatingTheme !== null}
          />
          <span className={styles.relevanceValue}>
            {theme.default_relevance_threshold}
          </span>
        </div>
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
          Manage which highlight themes are active, available to users, and set
          the default relevance threshold for each theme (for logged-out users)
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
          Configure default auto-highlights behavior for logged-out users and
          new users
        </p>

        {settingsError && <div className={styles.error}>{settingsError}</div>}
        {createSuccess && <div className={styles.success}>{createSuccess}</div>}

        <div className={styles.settingsCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <label className={styles.settingLabel}>
                Enable Auto-Highlights by Default
              </label>
              <p className={styles.settingDescription}>
                When enabled, auto-highlights will be shown by default for
                logged-out users and new users. Users can toggle this in their
                settings.
              </p>
            </div>
            <div className={styles.settingControl}>
              <input
                type="checkbox"
                checked={tempEnabled}
                onChange={(e) => setTempEnabled(e.target.checked)}
                disabled={loadingSettings}
                className={styles.checkbox}
              />
              <Button
                variant="contained"
                onClick={handleUpdateEnabled}
                loading={updatingEnabled}
                disabled={
                  updatingEnabled ||
                  loadingSettings ||
                  tempEnabled === defaultEnabled
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
