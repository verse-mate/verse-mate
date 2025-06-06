import { Footer as FooterComponent } from "../../ui/Footer";
// import { links } from "../../utils/footer-links";
import styles from "./footer.module.css";

export const Footer = () => {
  return (
    <FooterComponent.Root className={`${styles.footer}`}>
      <FooterComponent.Content>
        <FooterComponent.Logo />
        {/* <FooterComponent.Links links={links} /> */}
      </FooterComponent.Content>
    </FooterComponent.Root>
  );
};
