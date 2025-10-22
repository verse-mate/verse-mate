import { useHeader } from "../../hooks/useHeader";
import { useInput } from "../../hooks/useInput";
import { Header as HeaderComponent } from "../../ui/Header";
import { ProfileButton } from "../../ui/Header/UserProfile/user-profile";
import styles from "./header.module.css";

type HeaderProps = {
  setRightPanelContent: (value: string) => void;
};

export const Header = ({ setRightPanelContent }: HeaderProps) => {
  // Header hooks
  const { isFocused, setIsFocusedState } = useInput();
  const { isSmallScreen } = useHeader();

  return (
    <HeaderComponent.Root className={styles.header}>
      <HeaderComponent.Content>
        {(!isSmallScreen || !isFocused) && <HeaderComponent.Logo link="/" />}
        <HeaderComponent.InputBar setIsFocused={setIsFocusedState} />
        {(!isSmallScreen || !isFocused) && (
          <ProfileButton setRightPanelContent={setRightPanelContent} />
        )}
      </HeaderComponent.Content>
    </HeaderComponent.Root>
  );
};
