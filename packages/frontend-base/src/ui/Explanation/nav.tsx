import styles from "./explanation.module.css";
import { NavLinks } from "./nav-links";

export const NavHeader = () => {
  return (
    <>
      <div className={`${styles.separator}`} />
      <div className={`${styles.wrapper}`}>
        <NavLinks />
      </div>
    </>
  );
};
