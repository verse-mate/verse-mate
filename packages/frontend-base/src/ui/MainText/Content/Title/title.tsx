import styles from "./title.module.css";

type TitleProps = {
  title: string;
};

export const Title = ({ title }: TitleProps) => {
  return <label className={styles.title}>{title}</label>;
};
