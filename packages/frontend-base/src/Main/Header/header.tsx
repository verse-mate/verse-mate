import { useHeader } from "../../hooks/useHeader";
import { useInput } from "../../hooks/useInput";
import { Header as HeaderComponent } from "../../ui/Header";
import styles from "./header.module.css";

export const Header = () => {
  // Header hooks
  const { isFocused, setIsFocusedState } = useInput();
  const { isSmallScreen } = useHeader();

  return (
    <HeaderComponent.Root className={styles.header}>
      <HeaderComponent.Content>
        {(!isSmallScreen || !isFocused) && <HeaderComponent.Logo link="/" />}
        <HeaderComponent.InputBar setIsFocused={setIsFocusedState} />
        {(!isSmallScreen || !isFocused) && (
          <HeaderComponent.ProfileButton link="/settings" />
        )}
      </HeaderComponent.Content>
    </HeaderComponent.Root>
  );
};
