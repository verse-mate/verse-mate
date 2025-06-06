import styles from "./chat.module.css";

type Props = {
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export const ScrollArea = ({ children, ...rest }: Props) => {
  return (
    <div className={styles.scrollArea} {...rest}>
      {children}
    </div>
  );
};
