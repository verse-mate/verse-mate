import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import { useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../../analytics";
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
  const [isExpanded, setIsExpanded] = useState(false);

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
          // Logged-out user: fetch themes and use global default
          const [themesResponse, defaultEnabledResponse] = await Promise.all([
            api.bible["highlight-themes"].get(),
            api.admin["auto-highlight-settings"]["default-enabled"].get(),
          ]);

          const defaultEnabled =
            defaultEnabledResponse.data?.data?.default_enabled ?? false;

          if (themesResponse.data?.data) {
            const defaultThemes = (themesResponse.data.data as any[]).map(
              (theme) => ({
                theme_id: theme.theme_id,
                theme_name: theme.name,
                theme_color: theme.color,
                theme_description: theme.description,
                is_enabled: defaultEnabled,
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

    // Get the theme name for analytics
    const theme = themes.find((t) => t.theme_id === themeId);

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

      // Track AUTO_HIGHLIGHT_SETTING_CHANGED event
      analytics.track(AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED, {
        themeName: theme?.theme_name || `Theme ${themeId}`,
        enabled: newStatus,
      });
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

      // Track AUTO_HIGHLIGHT_SETTING_CHANGED for bulk enable
      analytics.track(AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED, {
        themeName: "All Themes",
        enabled: true,
      });
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

      // Track AUTO_HIGHLIGHT_SETTING_CHANGED for bulk disable
      analytics.track(AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED, {
        themeName: "All Themes",
        enabled: false,
      });
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
      red: "#fca5a5",
      teal: "#5eead4",
      brown: "#d7bfaa",
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
      <Button
        variant="outlined"
        onClick={() => setIsExpanded(!isExpanded)}
        className={autoHighlightStyles.toggleButton}
      >
        {isExpanded ? "Hide" : "Show"}
      </Button>

      {isExpanded && (
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
                Customize which themes are visible and set how relevant
                highlights should be (1 = most relevant, 5 = all).
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
              <Button variant="outlined" onClick={handleEnableAll}>
                Enable All
              </Button>
              <Button variant="outlined" onClick={handleDisableAll}>
                Disable All
              </Button>
            </div>
          )}

          <div className={autoHighlightStyles.themeList}>
            {themes.map((theme) => (
              <div
                key={theme.theme_id}
                className={autoHighlightStyles.themeItem}
              >
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
      )}
    </div>
  );
};
