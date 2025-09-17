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
  PencilIcon,
  SettingsIcon,
  UserIcon,
} from "../Icons";
import { Input } from "../Input";
import { SelectDropdown } from "../SelectDropdown";
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
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );
  const [isOpen, setIsOpen] = useState(false);

  // User profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState(session?.firstName || "");
  const [lastName, setLastName] = useState(session?.lastName || "");
  const [email, setEmail] = useState(session?.email || "");
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Language preferences state
  const [isEditingLanguage, setIsEditingLanguage] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(
    session?.preferred_language || "en",
  );
  const [languageUpdateSuccess, setLanguageUpdateSuccess] = useState(false);
  const [languageUpdateError, setLanguageUpdateError] = useState<string | null>(
    null,
  );
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: string; name: string; nativeName: string }[]
  >([]);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await api.explanations.languages.get();
        if (response.data) {
          setAvailableLanguages(response.data as any);
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
      setSelectedLanguage(session.preferred_language || "en");
    }
  }, [session]);

  const { mutateAsync: updateProfile, isLoading: isUpdatingProfile } =
    useMutation({
      mutationFn: api.auth.profile.put,
      onSuccess: async () => {
        setUpdateSuccess(true);
        setUpdateError(null);
        setIsEditingProfile(false);
        // Refresh session to get updated user data
        await fetchSession(true);
        // Clear success message after 3 seconds
        setTimeout(() => setUpdateSuccess(false), 3000);
      },
      onError: (error: any) => {
        let errorMessage = "An error occurred while updating your profile.";

        // Handle different error structures from the API
        if (error?.value?.message === "EMAIL_ALREADY_EXISTS") {
          errorMessage =
            "This email address is already in use by another account.";
        } else if (error?.value && typeof error.value === "string") {
          errorMessage = error.value;
        } else if (typeof error === "string") {
          errorMessage = error;
        }

        setUpdateError(errorMessage);
        setUpdateSuccess(false);
      },
    });

  // Language preferences API integration
  const {
    mutateAsync: updateLanguagePreference,
    isLoading: isUpdatingLanguage,
  } = useMutation({
    mutationFn: (language: string | null) =>
      api.user.preferences.patch({ preferred_language: language }),
    onSuccess: async () => {
      setLanguageUpdateSuccess(true);
      setLanguageUpdateError(null);
      setIsEditingLanguage(false);
      await fetchSession(true); // Refresh session data
      setTimeout(() => setLanguageUpdateSuccess(false), 3000);
    },
    onError: (error: any) => {
      setLanguageUpdateError("Failed to update language preference.");
      setLanguageUpdateSuccess(false);
    },
  });

  const handleLogout = async () => {
    destroyCookie(null, "accessToken");
    window.location.reload();
  };

  const handleSaveProfile = async () => {
    // Clear previous messages
    setUpdateError(null);
    setUpdateSuccess(false);

    // Validate inputs
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setUpdateError("All fields are required.");
      return;
    }

    if (
      email.trim() === session?.email &&
      firstName.trim() === session?.firstName &&
      lastName.trim() === session?.lastName
    ) {
      setUpdateError("No changes detected.");
      return;
    }

    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
    } catch (error) {
      // Error handling is done in the onError callback
      console.error("Profile update failed:", error);
    }
  };

  const handleCancelEdit = () => {
    // Reset to original values
    setFirstName(session?.firstName || "");
    setLastName(session?.lastName || "");
    setEmail(session?.email || "");
    setIsEditingProfile(false);
    // Clear any error messages
    setUpdateError(null);
    setUpdateSuccess(false);
  };

  const handleLanguageChange = (val: any) => {
    setSelectedLanguage(val as string);
  };

  const handleSaveLanguage = async () => {
    setLanguageUpdateError(null);
    setLanguageUpdateSuccess(false);

    const languageToSave =
      selectedLanguage === "automatic" ? null : selectedLanguage;

    if (languageToSave === session?.preferred_language) {
      setLanguageUpdateError("No changes detected.");
      return;
    }

    try {
      await updateLanguagePreference(languageToSave);
    } catch (error) {
      console.error("Language preference update failed:", error);
    }
  };

  const handleCancelLanguage = () => {
    setSelectedLanguage(session?.preferred_language || "en");
    setIsEditingLanguage(false);
    setLanguageUpdateError(null);
    setLanguageUpdateSuccess(false);
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
      <div style={{ height: "30px" }} />
      <div>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontWeight: "bold",
            fontSize: "20px",
          }}
        >
          Bible Version:
        </label>
        <SelectDropdown.Root
          onValueChange={(val) => setSelectedBibleVersion(val)}
          open={isOpen}
          onOpenChange={setIsOpen}
          className={styles.bibleVersionDropdown}
        >
          <SelectDropdown.Trigger
            selectedBook={null}
            selectedVerse={null}
            defaultPlaceholder={selectedVersionData?.value || "Select Version"}
            icon={<ChevronDownIcon />}
            onClick={() => setIsOpen((prev) => !prev)}
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

      {/* Language Preferences Section */}
      {session?.id && (
        <div style={{ marginTop: "40px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
              fontSize: "20px",
            }}
          >
            Language Preferences:
          </label>

          <div className={styles.languageContainer}>
            <div className={styles.languageHeader}>
              <div className={styles.languageInfo}>
                {!isEditingLanguage ? (
                  <>
                    <div className={styles.languageLabel}>
                      Preferred Language:
                    </div>
                    <div className={styles.languageValue}>
                      {availableLanguages.find(
                        (lang) => lang.code === selectedLanguage,
                      )?.nativeName || "English"}
                    </div>
                  </>
                ) : (
                  <div className={styles.editingInfo}>
                    <span className={styles.editingText}>
                      Editing language preference...
                    </span>
                  </div>
                )}
              </div>
              {!isEditingLanguage && (
                <Button
                  variant="outlined"
                  onClick={() => setIsEditingLanguage(true)}
                  className={styles.editButton}
                >
                  <PencilIcon className={styles.editIcon} />
                </Button>
              )}
            </div>

            {isEditingLanguage && (
              <div className={styles.editForm}>
                {languageUpdateError && (
                  <div className={styles.errorMessage}>
                    {languageUpdateError}
                  </div>
                )}

                {languageUpdateSuccess && (
                  <div className={styles.successMessage}>
                    Language preference updated successfully!
                  </div>
                )}

                <div className={styles.languageDropdownContainer}>
                  <label className={styles.dropdownLabel}>
                    Select Language:
                  </label>
                  <SelectDropdown.Root
                    onValueChange={handleLanguageChange}
                    open={isLanguageDropdownOpen}
                    onOpenChange={setIsLanguageDropdownOpen}
                    className={styles.languageDropdown}
                  >
                    <SelectDropdown.Trigger
                      selectedBook={null}
                      selectedVerse={null}
                      defaultPlaceholder={
                        availableLanguages.find(
                          (lang) => lang.code === selectedLanguage,
                        )?.nativeName || "Select Language"
                      }
                      icon={<ChevronDownIcon />}
                    />
                    <SelectDropdown.Content
                      align="start"
                      style={{
                        width: "300px",
                        maxHeight: "300px",
                        overflowY: "auto",
                      }}
                    >
                      <SelectDropdown.Item
                        key="automatic"
                        value="automatic"
                        icon={<CheckIcon />}
                      >
                        Automatic (Based on Bible Version)
                      </SelectDropdown.Item>
                      {availableLanguages.map((language) => (
                        <SelectDropdown.Item
                          key={language.code}
                          value={language.code}
                          icon={<CheckIcon />}
                        >
                          {language.nativeName} ({language.name})
                        </SelectDropdown.Item>
                      ))}
                    </SelectDropdown.Content>
                  </SelectDropdown.Root>
                </div>

                <div className={styles.editActions}>
                  <Button
                    variant="outlined"
                    onClick={handleCancelLanguage}
                    className={styles.cancelButton}
                    disabled={isUpdatingLanguage}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveLanguage}
                    className={styles.saveButton}
                    loading={isUpdatingLanguage}
                    disabled={isUpdatingLanguage}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Profile Section */}
      {session?.id && (
        <div style={{ marginTop: "40px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
              fontSize: "20px",
            }}
          >
            Profile Information:
          </label>

          <div className={styles.profileContainer}>
            <div className={styles.profileHeader}>
              <div className={styles.profileIconWrapper}>
                <UserIcon className={styles.profileUserIcon} />
              </div>
              <div className={styles.profileInfo}>
                {!isEditingProfile ? (
                  <>
                    <div className={styles.profileName}>
                      {session?.firstName} {session?.lastName}
                    </div>
                    <div className={styles.profileEmail}>{session?.email}</div>
                  </>
                ) : (
                  <div className={styles.editingInfo}>
                    <span className={styles.editingText}>
                      Editing profile...
                    </span>
                  </div>
                )}
              </div>
              {!isEditingProfile && (
                <Button
                  variant="outlined"
                  onClick={() => setIsEditingProfile(true)}
                  className={styles.editButton}
                >
                  <PencilIcon className={styles.editIcon} />
                </Button>
              )}
            </div>

            {isEditingProfile && (
              <div className={styles.editForm}>
                {updateError && (
                  <div className={styles.errorMessage}>{updateError}</div>
                )}

                {updateSuccess && (
                  <div className={styles.successMessage}>
                    Profile updated successfully!
                  </div>
                )}

                <Input.Root>
                  <Input.Label label="First Name" />
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                    disabled={isUpdatingProfile}
                  />
                </Input.Root>

                <Input.Root>
                  <Input.Label label="Last Name" />
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                    disabled={isUpdatingProfile}
                  />
                </Input.Root>

                <Input.Root>
                  <Input.Label label="Email" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    disabled={isUpdatingProfile}
                  />
                </Input.Root>

                <div className={styles.editActions}>
                  <Button
                    variant="outlined"
                    onClick={handleCancelEdit}
                    className={styles.cancelButton}
                    disabled={isUpdatingProfile}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveProfile}
                    className={styles.saveButton}
                    loading={isUpdatingProfile}
                    disabled={isUpdatingProfile}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account Actions Section */}
      {session?.id && (
        <div style={{ marginTop: "40px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "16px",
              fontWeight: "bold",
              fontSize: "20px",
            }}
          >
            Account Actions:
          </label>

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
