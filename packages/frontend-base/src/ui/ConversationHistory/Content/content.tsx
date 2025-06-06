import styles from "./content.module.css";

type ContentProps = {
  children: React.ReactNode;
  className?: string;
};

export const Content = ({ children, className }: ContentProps) => {
  return <div className={`${className} ${styles.container}`}>{children}</div>;
};
