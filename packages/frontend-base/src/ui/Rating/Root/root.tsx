import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  className?: string;
};

export const Root = ({ children, className }: RootProps) => {
  return <div className={`${styles.container} ${className}`}>{children}</div>;
};
