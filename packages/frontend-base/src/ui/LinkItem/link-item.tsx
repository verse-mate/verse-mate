import Link from "next/link";
import styles from "./link-item.module.css";

type ItemProps = {
  icon: React.ReactNode;
  label: string;
  link: string;
};

export const LinkItem = ({ icon, label, link }: ItemProps) => {
  return (
    <Link href={link} className={`${styles.container} ${styles.link}`}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
    </Link>
  );
};
