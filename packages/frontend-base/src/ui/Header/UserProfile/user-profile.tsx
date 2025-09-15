"use client";

import { userSession } from "../../../hooks/userSession";
import styles from "./user-profile.module.css";

type UserProfileProps = {
  link: string;
  setRightPanelContent: (value: string) => void;
};

export const ProfileButton = ({
  link,
  setRightPanelContent,
}: UserProfileProps) => {
  const { session } = userSession();

  return (
    <>
      {session?.id ? // Hide user profile card for authenticated users
      null : (
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
      )}
    </>
  );
};
