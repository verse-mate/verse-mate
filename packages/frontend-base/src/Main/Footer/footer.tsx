import { Footer as FooterComponent } from "../../ui/Footer";
import styles from "./footer.module.css";

export const Footer = () => {
  return (
    <FooterComponent.Root className={`${styles.footer}`}>
      <FooterComponent.Content>
        <FooterComponent.Logo />
      </FooterComponent.Content>
    </FooterComponent.Root>
  );
};
