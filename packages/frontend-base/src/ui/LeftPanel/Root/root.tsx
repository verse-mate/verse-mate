import styles from "./root.module.css";

type Props = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};
export const Root = ({ children, style }: Props) => {
  return (
    <section className={`${styles.leftSide}`} style={style}>
      {children}
    </section>
  );
};
