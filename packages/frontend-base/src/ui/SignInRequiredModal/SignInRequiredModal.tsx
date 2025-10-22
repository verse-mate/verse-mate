import { addModal, removeAllModals } from "../../modal/store";
import styles from "./sign-in-required-modal.module.css";

/**
 * Helper function to show a sign-in required modal
 * @param feature - The name of the feature requiring authentication (e.g., "Bookmarks", "Notes")
 * @param message - Optional custom message to display. If not provided, a default message will be used.
 */
export const showSignInRequiredModal = (feature: string, message?: string) => {
  const defaultMessage = `${feature} ${feature.endsWith("s") ? "are" : "is"} only available for signed-in accounts. Please sign in to use this feature.`;

  addModal({
    content: (
      <div className={styles.loginModal}>
        <h3>Sign in Required to Use {feature}</h3>
        <p>{message || defaultMessage}</p>
        <div className={styles.loginModalButtons}>
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => {
              // Open right panel login by switching to the menu tab
              try {
                localStorage.setItem("postRightPanelContent", "login");
              } catch {}

              // Notify MainContent to switch tab and open login immediately
              try {
                window.dispatchEvent(
                  new CustomEvent("openRightPanelContent", {
                    detail: "login",
                  }),
                );
                window.dispatchEvent(
                  new CustomEvent("setActiveTab", { detail: "menu" }),
                );
              } catch {}

              // Remove the modal after a short delay to allow the panel to open
              setTimeout(() => {
                removeAllModals();
              }, 100);
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    ),
  });
};
