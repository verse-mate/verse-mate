import styles from "./title.module.css";

type TitleProps = {
  title?: string;
};

export const Title = ({ title }: TitleProps) => {
  return (
    <div className={styles.container}>
      <span>{title}</span>
    </div>
  );
};
