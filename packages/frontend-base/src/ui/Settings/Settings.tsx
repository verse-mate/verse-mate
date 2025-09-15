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

  // Update form fields when session data changes
  useEffect(() => {
    if (session) {
      setFirstName(session.firstName || "");
      setLastName(session.lastName || "");
      setEmail(session.email || "");
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
