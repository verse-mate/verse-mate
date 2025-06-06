import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export const Root = ({ children, ...rest }: RootProps) => {
  return (
    <div className={styles.container} {...rest}>
      {children}
    </div>
  );
};
