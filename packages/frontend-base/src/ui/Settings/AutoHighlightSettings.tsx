import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import useMutation from "../../hooks/useMutation";
import { Button } from "../Button/Button";
import autoHighlightStyles from "./autoHighlightSettings.module.css";
import styles from "./settings.module.css";

interface HighlightTheme {
  theme_id: number;
  theme_name: string;
  theme_color: string;
  theme_description: string | null;
  is_enabled: boolean;
  custom_color: string | null;
  relevance_threshold: number;
}

interface AutoHighlightSettingsProps {
  isLoggedIn: boolean;
}

export const AutoHighlightSettings = ({
  isLoggedIn,
}: AutoHighlightSettingsProps) => {
  const queryClient = useQueryClient();
  const [themes, setThemes] = useState<HighlightTheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);

  // Fetch user theme preferences
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (isLoggedIn) {
          // Logged-in user: fetch preferences
          const response = await api.bible.user["theme-preferences"].get();
          if (response.data?.data) {
            setThemes(response.data.data as HighlightTheme[]);
          }
        } else {
          // Logged-out user: fetch themes and use defaults
          const response = await api.bible["highlight-themes"].get();
          if (response.data?.data) {
            const defaultThemes = (response.data.data as any[]).map(
              (theme) => ({
                theme_id: theme.theme_id,
                theme_name: theme.name,
                theme_color: theme.color,
                theme_description: theme.description,
                is_enabled: true,
                custom_color: null,
                relevance_threshold: 3,
              }),
            );
            setThemes(defaultThemes);
          }
        }
      } catch (err) {
        console.error("Failed to fetch highlight preferences:", err);
        setError("Failed to load highlight preferences");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [isLoggedIn]);

  // Update preference mutation
  const { mutateAsync: updatePreference } = useMutation({
    mutationFn: (params: {
      theme_id: number;
      is_enabled?: boolean;
      relevance_threshold?: number;
    }) => {
      // @ts-expect-error - Dynamic path parameter
      return api.bible.user["theme-preferences"][params.theme_id].patch({
        is_enabled: params.is_enabled,
        relevance_threshold: params.relevance_threshold,
      });
    },
    onSuccess: () => {
      // Invalidate user preferences query
      queryClient.invalidateQueries({
        queryKey: ["user-theme-preferences"],
      });

      // Invalidate auto-highlights queries to refresh
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey as unknown as (string | undefined)[];
          return Array.isArray(k) && k[0] === "auto-highlights";
        },
      });
    },
  });

  const handleToggleTheme = async (themeId: number, currentStatus: boolean) => {
    if (!isLoggedIn) return;

    const newStatus = !currentStatus;

    // Optimistic update
    setThemes((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId
          ? { ...theme, is_enabled: newStatus }
          : theme,
      ),
    );

    try {
      await updatePreference({ theme_id: themeId, is_enabled: newStatus });
      setSuccessMessage("Theme preference updated");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Failed to update theme:", err);
      // Revert optimistic update
      setThemes((prev) =>
        prev.map((theme) =>
          theme.theme_id === themeId
            ? { ...theme, is_enabled: currentStatus }
            : theme,
        ),
      );
      setError("Failed to update theme preference");
    }
  };

  const handleRelevanceChange = (themeId: number, newRelevance: number) => {
    if (!isLoggedIn) return;

    // Update local state immediately
    setThemes((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId
          ? { ...theme, relevance_threshold: newRelevance }
          : theme,
      ),
    );

    // Debounce the API call
    setPendingChanges(true);
    const timeoutId = setTimeout(async () => {
      try {
        await updatePreference({
          theme_id: themeId,
          relevance_threshold: newRelevance,
        });
        setPendingChanges(false);
        setSuccessMessage("Relevance threshold updated");
        setTimeout(() => setSuccessMessage(null), 2000);
      } catch (err) {
        console.error("Failed to update relevance:", err);
        setError("Failed to update relevance threshold");
        setPendingChanges(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleEnableAll = async () => {
    if (!isLoggedIn) return;

    // Optimistic update
    setThemes((prev) => prev.map((theme) => ({ ...theme, is_enabled: true })));

    try {
      await Promise.all(
        themes.map((theme) =>
          updatePreference({ theme_id: theme.theme_id, is_enabled: true }),
        ),
      );
      setSuccessMessage("All themes enabled");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Failed to enable all themes:", err);
      setError("Failed to enable all themes");
    }
  };

  const handleDisableAll = async () => {
    if (!isLoggedIn) return;

    // Optimistic update
    setThemes((prev) => prev.map((theme) => ({ ...theme, is_enabled: false })));

    try {
      await Promise.all(
        themes.map((theme) =>
          updatePreference({ theme_id: theme.theme_id, is_enabled: false }),
        ),
      );
      setSuccessMessage("All themes disabled");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Failed to disable all themes:", err);
      setError("Failed to disable all themes");
    }
  };

  const getColorBadgeStyle = (color: string) => {
    const colorMap: Record<string, string> = {
      yellow: "#fef08a",
      blue: "#bfdbfe",
      green: "#bbf7d0",
      orange: "#fed7aa",
      pink: "#fbcfe8",
      purple: "#e9d5ff",
    };
    return { backgroundColor: colorMap[color] || "#e0e0e0" };
  };

  if (isLoading) {
    return (
      <div className={styles.sectionSpacing}>
        <label className={styles.sectionLabel}>Auto-Highlights:</label>
        <div className={autoHighlightStyles.loadingContainer}>
          <p>Loading highlight preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sectionSpacing}>
      <label className={styles.sectionLabel}>Auto-Highlights:</label>

      <div className={autoHighlightStyles.container}>
        {!isLoggedIn && (
          <div className={autoHighlightStyles.loginPrompt}>
            <p>
              Sign in to customize which AI-generated highlight themes are
              visible and set relevance preferences.
            </p>
          </div>
        )}

        <div className={autoHighlightStyles.description}>
          <p>
            AI-generated highlights help identify key verses, promises,
            commands, and more throughout the Bible.
          </p>
          {isLoggedIn && (
            <p>
              Customize which themes are visible and set how relevant highlights
              should be (1 = most relevant, 5 = all).
            </p>
          )}
        </div>

        {error && (
          <div className={autoHighlightStyles.errorMessage}>{error}</div>
        )}
        {successMessage && (
          <div className={autoHighlightStyles.successMessage}>
            {successMessage}
          </div>
        )}

        {isLoggedIn && (
          <div className={autoHighlightStyles.actions}>
            <Button
              variant="outlined"
              onClick={handleEnableAll}
              disabled={pendingChanges}
            >
              Enable All
            </Button>
            <Button
              variant="outlined"
              onClick={handleDisableAll}
              disabled={pendingChanges}
            >
              Disable All
            </Button>
          </div>
        )}

        <div className={autoHighlightStyles.themeList}>
          {themes.map((theme) => (
            <div key={theme.theme_id} className={autoHighlightStyles.themeItem}>
              <div className={autoHighlightStyles.themeHeader}>
                <label className={autoHighlightStyles.themeToggle}>
                  <input
                    type="checkbox"
                    checked={theme.is_enabled}
                    onChange={() =>
                      handleToggleTheme(theme.theme_id, theme.is_enabled)
                    }
                    disabled={!isLoggedIn}
                    className={autoHighlightStyles.checkbox}
                  />
                  <span className={autoHighlightStyles.themeName}>
                    <span
                      className={autoHighlightStyles.colorBadge}
                      style={getColorBadgeStyle(theme.theme_color)}
                    />
                    {theme.theme_name}
                  </span>
                </label>
              </div>

              {theme.theme_description && (
                <p className={autoHighlightStyles.themeDescription}>
                  {theme.theme_description}
                </p>
              )}

              <div className={autoHighlightStyles.relevanceControl}>
                <label className={autoHighlightStyles.relevanceLabel}>
                  Relevance: {theme.relevance_threshold}
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={theme.relevance_threshold}
                  onChange={(e) =>
                    handleRelevanceChange(
                      theme.theme_id,
                      Number(e.target.value),
                    )
                  }
                  disabled={!isLoggedIn || !theme.is_enabled}
                  className={autoHighlightStyles.slider}
                />
                <div className={autoHighlightStyles.relevanceLabels}>
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={autoHighlightStyles.legend}>
          <h4>Visual Guide:</h4>
          <div className={autoHighlightStyles.legendItems}>
            <div className={autoHighlightStyles.legendItem}>
              <span className={autoHighlightStyles.legendSwatch}>
                <span className={autoHighlightStyles.userHighlight} />
              </span>
              <span>Your highlights (solid background)</span>
            </div>
            <div className={autoHighlightStyles.legendItem}>
              <span className={autoHighlightStyles.legendSwatch}>
                <span className={autoHighlightStyles.autoHighlight} />
              </span>
              <span>Auto-highlights (lighter background + underline)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
