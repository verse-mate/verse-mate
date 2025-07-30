import { useEffect, useState } from "react";
import {
  type CacheSettings as CacheSettingsType,
  type CacheStats,
  cacheManager,
  cleanupCache,
  clearAllCache,
  formatCacheSize,
  getCacheHealth,
  getCacheSettings,
  getCacheStats,
  updateCacheSettings,
} from "../../utils/cache-manager";
import { Button } from "../Button/Button";
import { Input } from "../Input";
import { Switch } from "../Switch/Switch";
import styles from "./CacheSettings.module.css";

interface CacheSettingsProps {
  className?: string;
  onClose?: () => void;
}

export function CacheSettings({ className = "", onClose }: CacheSettingsProps) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [settings, setSettings] = useState<CacheSettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    loadCacheData();
  }, []);

  const loadCacheData = async () => {
    setIsLoading(true);
    try {
      const [cacheStats, cacheHealth, cacheSettings] = await Promise.all([
        getCacheStats(),
        getCacheHealth(),
        getCacheSettings(),
      ]);

      setStats(cacheStats);
      setHealth(cacheHealth);
      setSettings(cacheSettings);
    } catch (error) {
      console.error("Failed to load cache data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      await cleanupCache();
      await loadCacheData(); // Refresh data
    } catch (error) {
      console.error("Failed to cleanup cache:", error);
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all cached data? This will remove all offline content.",
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      await clearAllCache();
      await loadCacheData(); // Refresh data
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSettingsChange = (key: keyof CacheSettingsType, value: any) => {
    if (!settings) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    updateCacheSettings({ [key]: value });
  };

  if (isLoading || !stats || !health || !settings) {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.loading}>Loading cache information...</div>
      </div>
    );
  }

  const maxSizeBytes = settings.maxCacheSize * 1024 * 1024;
  const usagePercentage = Math.round((stats.totalSize / maxSizeBytes) * 100);

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Cache Settings</h2>
        {onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      {/* Cache Health Status */}
      <div className={`${styles.healthStatus} ${styles[health.status]}`}>
        <div className={styles.healthIcon}>
          {health.status === "healthy" && "✅"}
          {health.status === "warning" && "⚠️"}
          {health.status === "critical" && "🚨"}
        </div>
        <div className={styles.healthContent}>
          <div className={styles.healthMessage}>{health.message}</div>
          {health.recommendations.length > 0 && (
            <ul className={styles.recommendations}>
              {health.recommendations.map((rec: string) => (
                <li key={rec}>{rec}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Cache Statistics */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Storage Usage</h3>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>Total Size</div>
            <div className={styles.statValue}>
              {formatCacheSize(stats.totalSize)} /{" "}
              {formatCacheSize(maxSizeBytes)}
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statLabel}>Cached Chapters</div>
            <div className={styles.statValue}>{stats.chapters}</div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statLabel}>Cached Explanations</div>
            <div className={styles.statValue}>{stats.explanations}</div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statLabel}>User Progress Items</div>
            <div className={styles.statValue}>{stats.userProgress}</div>
          </div>
        </div>
      </div>

      {/* Cache Settings */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Settings</h3>
        <div className={styles.settingsGrid}>
          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              Max Cache Size (MB)
              <Input.Root>
                <Input
                  type="number"
                  min="10"
                  max="500"
                  value={settings.maxCacheSize}
                  onChange={(e) =>
                    handleSettingsChange(
                      "maxCacheSize",
                      Number.parseInt(e.target.value),
                    )
                  }
                />
              </Input.Root>
            </label>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              Max Cache Age (days)
              <Input.Root>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.maxCacheAge}
                  onChange={(e) =>
                    handleSettingsChange(
                      "maxCacheAge",
                      Number.parseInt(e.target.value),
                    )
                  }
                />
              </Input.Root>
            </label>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              Auto Cleanup Interval (hours)
              <Input.Root>
                <Input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.cleanupInterval}
                  onChange={(e) =>
                    handleSettingsChange(
                      "cleanupInterval",
                      Number.parseInt(e.target.value),
                    )
                  }
                />
              </Input.Root>
            </label>
          </div>

          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              Enable Auto Cleanup
              <Switch
                id="auto-cleanup-switch"
                checked={settings.autoCleanupEnabled}
                onChange={(e) =>
                  handleSettingsChange("autoCleanupEnabled", e.target.checked)
                }
              />
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Button onClick={handleCleanup} disabled={isCleaningUp || isClearing}>
          {isCleaningUp ? "Cleaning up..." : "Clean Up Cache"}
        </Button>

        <Button onClick={handleClearAll} disabled={isCleaningUp || isClearing}>
          {isClearing ? "Clearing..." : "Clear All Cache"}
        </Button>
      </div>
    </div>
  );
}
