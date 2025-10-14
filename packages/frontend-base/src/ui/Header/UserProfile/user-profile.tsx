"use client";

import { userSession } from "../../../hooks/userSession";
import styles from "./user-profile.module.css";

type UserProfileProps = {
  setRightPanelContent: (value: string) => void;
};

export const ProfileButton = ({ setRightPanelContent }: UserProfileProps) => {
  const { session, loading } = userSession();

  // Don't render anything to avoid flash during loading or for authenticated users
  if (loading || session?.id) {
    return null;
  }

  // Only show login/signup for unauthenticated users after loading is complete
  return (
    <div className={styles.desktopMenu}>
      <button
        type="button"
        className={styles.menuItem}
        onClick={() => setRightPanelContent("login")}
      >
        Login
      </button>
      <button
        type="button"
        className={styles.menuItem}
        onClick={() => setRightPanelContent("signup")}
      >
        Sign Up
      </button>
    </div>
  );
};
