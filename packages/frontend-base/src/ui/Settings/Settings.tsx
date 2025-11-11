import { useQueryClient } from "@tanstack/react-query";
import { api } from "backend-api";
import Link from "next/link";
import { destroyCookie } from "nookies";
import { useEffect, useState } from "react";
import useMutation from "../../hooks/useMutation";
import { userSession } from "../../hooks/userSession";
import { bibleVersions } from "../../utils/bible-versions";
import { Button } from "../Button/Button";
import {
  CheckIcon,
  ChevronBackward,
  ChevronDownIcon,
  LogoutIcon,
  SettingsIcon,
  UserIcon,
} from "../Icons";
import { Input } from "../Input";
import { SelectDropdown } from "../SelectDropdown";
import { AutoHighlightSettings } from "./AutoHighlightSettings";
import { formatLanguageDisplay } from "./languageFormatting";
import styles from "./settings.module.css";

interface SettingsProps {
  selectedBibleVersion: string;
  setSelectedBibleVersion: (version: string) => void;
  setRightPanelContent: (value: string) => void;
}

export const Settings = ({
  selectedBibleVersion,
  setSelectedBibleVersion,
  setRightPanelContent,
}: SettingsProps) => {
  const { session, fetchSession } = userSession();
  const queryClient = useQueryClient();
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );
  const [isOpen, setIsOpen] = useState(false);

  // Form state for always-editable fields
  const [firstName, setFirstName] = useState(session?.firstName || "");
  const [lastName, setLastName] = useState(session?.lastName || "");
  const [email, setEmail] = useState(session?.email || "");
  const [selectedLanguage, setSelectedLanguage] = useState(
    session?.preferred_language || "automatic",
  );

  // Global form state
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: string; name: string; nativeName: string }[]
  >([]);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await api.bible.languages.get();
        if (response.error) {
          throw response.error;
        }
        if (response.data) {
          // Properly map the API response to the expected structure
          const mappedLanguages = (response.data as any[]).map((lang) => ({
            code: lang.language_code,
            name: lang.name,
            nativeName: lang.native_name,
          }));
          // Sort languages alphabetically by native name
          const sortedLanguages = mappedLanguages.sort((a, b) =>
            a.nativeName.localeCompare(b.nativeName),
          );
          setAvailableLanguages(sortedLanguages);
        }
      } catch (error) {
        console.error("Failed to fetch available languages:", error);
        // Fallback to a default list or show an error
      }
    };

    fetchLanguages();
  }, []);

  // Update form fields when session data changes
  useEffect(() => {
    if (session) {
      setFirstName(session.firstName || "");
      setLastName(session.lastName || "");
      setEmail(session.email || "");
      setSelectedLanguage(session.preferred_language || "automatic");
    }
  }, [session]);

  const { mutateAsync: updateProfile } = useMutation({
    mutationFn: api.auth.profile.put,
    onSuccess: async () => {
      // Don't handle success here - will be handled by global save
    },
    onError: (_error: any) => {
      // Don't handle error here - will be handled by global save
    },
  });

  // Language preferences API integration
  const { mutateAsync: updateLanguagePreference } = useMutation({
    mutationFn: (language: string | null) =>
      api.user.preferences.patch({
        preferred_language: language ?? undefined,
      }),
    onSuccess: async () => {
      // Don't handle success here - will be handled by global save
    },
    onError: (_error: any) => {
      // Don't handle error here - will be handled by global save
    },
  });

  const handleLogout = async () => {
    destroyCookie(null, "accessToken");

    // Check device type for redirection
    const isDesktop =
      typeof window !== "undefined" && window.innerWidth >= 1024;

    if (isDesktop) {
      // For desktop: set activeTab to "explanation" and close hamburger menu
      localStorage.setItem("postLogoutRedirect", "desktop");
    } else {
      // For mobile/tablet: redirect to Bible page and close hamburger menu
      localStorage.setItem("postLogoutRedirect", "mobile");
    }

    window.location.reload();
  };

  const handleLanguageChange = async (val: any) => {
    const newLanguage = val as string;
    setSelectedLanguage(newLanguage);

    // Auto-save language preference immediately
    try {
      const languageToSave = newLanguage === "automatic" ? null : newLanguage;
      await updateLanguagePreference(languageToSave);
      await fetchSession(true);

      // Invalidate topic-related queries to refresh with new language
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey as unknown as (string | undefined)[];
          return (
            Array.isArray(k) &&
            (k[0] === "topic-details" ||
              k[0] === "topic-references" ||
              k[0] === "topic-details-explanation" ||
              k[0] === "topic-explanation" ||
              k[0] === "topics")
          );
        },
      });
    } catch (error) {
      console.error("Failed to save language preference:", error);
      // Optionally show an error message to the user
    }
  };

  // Global change detection (excluding language since it auto-saves)
  const hasChanges = () => {
    return (
      firstName !== (session?.firstName || "") ||
      lastName !== (session?.lastName || "") ||
      email !== (session?.email || "")
    );
  };

  const hasProfileChanges = () => {
    return (
      firstName !== (session?.firstName || "") ||
      lastName !== (session?.lastName || "") ||
      email !== (session?.email || "")
    );
  };

  // Global save handler
  const handleGlobalSave = async () => {
    setGlobalError(null);
    setGlobalSuccess(false);
    setIsSaving(true);

    // Validate inputs
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setGlobalError("All fields are required.");
      setIsSaving(false);
      return;
    }

    try {
      // Only save profile changes (language is auto-saved)
      if (!hasProfileChanges()) {
        setGlobalError("No changes detected.");
        setIsSaving(false);
        return;
      }

      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });

      // Refresh session data
      await fetchSession(true);
      setGlobalSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => setGlobalSuccess(false), 3000);
    } catch (error: any) {
      let errorMessage = "An error occurred while saving your changes.";

      // Handle different error structures from the API
      if (error?.value?.message === "EMAIL_ALREADY_EXISTS") {
        errorMessage =
          "This email address is already in use by another account.";
      } else if (error?.value && typeof error.value === "string") {
        errorMessage = error.value;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      setGlobalError(errorMessage);
      setGlobalSuccess(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.settingsRoot}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setRightPanelContent("default")}
        >
          <ChevronBackward className={styles.backIcon} />
        </button>
        <h3>Settings</h3>
      </div>
      <div className={styles.heightSpacer} />

      {/* Bible Version Section */}
      <div>
        <label className={styles.sectionLabel}>Bible Version:</label>

        <div className={styles.bibleVersionContainer}>
          <div className={styles.bibleVersionDropdownContainer}>
            <label className={styles.dropdownLabel}>
              Select Bible Version:
            </label>
            <div className={styles.dropdownWrapper}>
              <SelectDropdown.Root
                onValueChange={(val) => setSelectedBibleVersion(val)}
                open={isOpen}
                onOpenChange={setIsOpen}
              >
                <SelectDropdown.Trigger
                  selectedBook={null}
                  selectedVerse={null}
                  defaultPlaceholder={
                    selectedVersionData?.value || "Select Version"
                  }
                  icon={<ChevronDownIcon />}
                  onClick={() => setIsOpen((prev) => !prev)}
                  theme="light" // Explicitly set light theme for settings context
                  context="settings" // Add settings context for mobile visibility
                  expandText={true} // Enable text expansion for better readability
                />
                <SelectDropdown.Content
                  align="start"
                  style={{
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
          </div>
        </div>
      </div>

      {/* Language Preferences Section */}
      {session?.id && (
        <div className={styles.sectionSpacing}>
          <label className={styles.sectionLabel}>Language Preferences:</label>

          <div className={styles.languageContainer}>
            <div className={styles.languageDropdownContainer}>
              <label className={styles.dropdownLabel}>
                Preferred Language:
              </label>
              <div className={styles.languageDropdownWrapper}>
                <SelectDropdown.Root
                  key={selectedLanguage} // Force re-render when language changes
                  defaultValue={selectedLanguage}
                  onValueChange={handleLanguageChange}
                  open={isLanguageDropdownOpen}
                  onOpenChange={setIsLanguageDropdownOpen}
                >
                  <SelectDropdown.Trigger
                    selectedBook={null}
                    selectedVerse={null}
                    defaultPlaceholder={
                      selectedLanguage === "automatic"
                        ? "Automatic (Based on Bible Version)"
                        : (() => {
                            const selectedLang = availableLanguages.find(
                              (lang) => lang.code === selectedLanguage,
                            );
                            if (!selectedLang) return "Select Language";

                            // Apply the same formatting logic as in the dropdown items
                            return formatLanguageDisplay(selectedLang);
                          })()
                    }
                    icon={<ChevronDownIcon />}
                    theme="light" // Explicitly set light theme for settings context
                    context="settings" // Add settings context for mobile visibility
                    expandText={true} // Enable text expansion for better readability
                  />
                  <SelectDropdown.Content
                    align="start"
                    style={{
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {availableLanguages.map((language) => (
                      <SelectDropdown.Item
                        key={`lang-${language.code}`}
                        value={language.code}
                        icon={<CheckIcon />}
                      >
                        {formatLanguageDisplay(language)}
                      </SelectDropdown.Item>
                    ))}
                  </SelectDropdown.Content>
                </SelectDropdown.Root>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Highlight Settings Section */}
      <AutoHighlightSettings isLoggedIn={!!session?.id} />

      {/* User Profile Section */}
      {session?.id && (
        <div className={styles.sectionSpacing}>
          <label className={styles.sectionLabel}>Profile Information:</label>

          <div className={styles.profileContainer}>
            <div className={styles.profileHeader}>
              <div className={styles.profileIconWrapper}>
                <UserIcon className={styles.profileUserIcon} />
              </div>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>Profile Details</div>
                <div className={styles.profileEmail}>
                  Update your personal information
                </div>
              </div>
            </div>

            <div className={styles.profileForm}>
              <Input.Root>
                <Input.Label label="First Name" />
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                  disabled={isSaving}
                />
              </Input.Root>

              <Input.Root>
                <Input.Label label="Last Name" />
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter your last name"
                  disabled={isSaving}
                />
              </Input.Root>

              <Input.Root>
                <Input.Label label="Email" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={isSaving}
                />
              </Input.Root>
            </div>
          </div>
        </div>
      )}

      {/* Global Save Section */}
      {session?.id && (
        <div className={styles.globalSaveSection}>
          {globalError && (
            <div className={styles.errorMessage}>{globalError}</div>
          )}

          {globalSuccess && (
            <div className={styles.successMessage}>
              Settings updated successfully!
            </div>
          )}

          <Button
            onClick={handleGlobalSave}
            className={styles.globalSaveButton}
            loading={isSaving}
            disabled={isSaving || !hasChanges()}
          >
            {hasChanges() ? "Save Changes" : "No changes to save"}
          </Button>

          {hasChanges() && (
            <div className={styles.changeIndicator}>
              You have unsaved changes
            </div>
          )}
        </div>
      )}

      {/* Account Actions Section */}
      {session?.id && (
        <div className={styles.sectionSpacing}>
          <label className={styles.sectionLabel}>Account Actions:</label>

          <div className={styles.actionsContainer}>
            {session?.is_admin && (
              <Link href="/admin">
                <Button variant="outlined" className={styles.actionButton}>
                  <SettingsIcon className={styles.actionIcon} />
                  Admin Panel
                </Button>
              </Link>
            )}

            <Button
              variant="outlined"
              onClick={handleLogout}
              className={styles.actionButton}
            >
              <LogoutIcon className={styles.actionIcon} />
              Logout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
