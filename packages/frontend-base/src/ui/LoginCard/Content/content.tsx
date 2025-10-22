import Link from "next/link";
import { Button } from "../../Button/Button";
import {
  BookmarkIcon,
  HeartIcon,
  NotesIcon,
  PencilIcon,
  VerseMateLogoExtended,
} from "../../Icons";
import { Text } from "../../Text/Text";
import styles from "./content.module.css";

type ContentProps = {
  setRightPanelContent?: (value: string) => void;
};

import { useGetSearchParams } from "../../../hooks/useSearchParams";

export const Content = ({ setRightPanelContent }: ContentProps) => {
  const { bookId, verseId } = useGetSearchParams();

  const handleSignInClick = (e: React.MouseEvent) => {
    if (bookId && verseId) {
      localStorage.setItem(
        "redirectTo",
        `/?bookId=${bookId}&verseId=${verseId}`,
      );
    }
    if (setRightPanelContent) {
      e.preventDefault();
      setRightPanelContent("login");
    }
  };

  const handleSignUpClick = (e: React.MouseEvent) => {
    if (bookId && verseId) {
      localStorage.setItem(
        "redirectTo",
        `/?bookId=${bookId}&verseId=${verseId}`,
      );
    }
    if (setRightPanelContent) {
      e.preventDefault();
      setRightPanelContent("signup");
    }
  };

  return (
    <div className={styles.content}>
      <span className={styles.logo}>
        <VerseMateLogoExtended height={200} width={200} />
      </span>

      <div className={styles.benefitsSection}>
        <div className={styles.benefitsIcons}>
          <BookmarkIcon className={styles.benefitIcon} />
          <HeartIcon className={styles.benefitIcon} />
          <PencilIcon className={styles.benefitIcon} />
          <NotesIcon className={styles.benefitIcon} />
        </div>
        <Text className={styles.benefitsTitle}>
          A place for your personal content
        </Text>
        <Text className={styles.benefitsDescription}>
          Sign in to use the home tab, where all of your personal content,
          reading plans, and recent playlists will be easily accessible.
          (placeholder)
        </Text>
      </div>

      <div className={styles.buttonsContainer}>
        <Link
          href={`/login?bookId=${bookId}&verseId=${verseId}`}
          onClick={handleSignInClick}
        >
          <Button className={styles.signInButton}>Sign In</Button>
        </Link>

        <Text className={styles.signUpContainer}>
          <span className={styles.simpleText}>Don't have account?</span>
          <Link
            href={`/create-account?bookId=${bookId}&verseId=${verseId}`}
            className={styles.signUpLink}
            onClick={handleSignUpClick}
          >
            Create New Account
          </Link>
        </Text>
      </div>
    </div>
  );
};
