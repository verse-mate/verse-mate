import Image from "next/image";
import styles from "./logo.module.css";

export const Logo = () => {
  return (
    <div className={`${styles.leftBlock}`}>
      <div>
        <span>©</span>
        <span>2024</span>
      </div>
      <div className={styles.verseMateLogo}>
        <Image
          src={"/assets/logo/black-small-logo.png"}
          alt="VerseMate Logo"
          quality={100}
          priority={true}
          fill={true}
        />
      </div>
    </div>
  );
};
