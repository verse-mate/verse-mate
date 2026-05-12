import { useHeader } from "../../hooks/useHeader";
import { Header as HeaderComponent } from "../../ui/Header";
import { ProfileButton } from "../../ui/Header/UserProfile/user-profile";
import styles from "./header.module.css";

type HeaderProps = {
  setRightPanelContent: (value: string) => void;
};

/**
 * Per D-009 — InputBar (chat composer) removed; only logo + profile in header.
 */
export const Header = ({ setRightPanelContent }: HeaderProps) => {
  const { isSmallScreen } = useHeader();

  return (
    <HeaderComponent.Root className={styles.header}>
      <HeaderComponent.Content>
        {!isSmallScreen && <HeaderComponent.Logo link="/" />}
        <ProfileButton setRightPanelContent={setRightPanelContent} />
      </HeaderComponent.Content>
    </HeaderComponent.Root>
  );
};
