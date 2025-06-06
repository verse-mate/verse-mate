import styles from "./title.module.css";

type TitleProps = {
  title: string;
};

export const Title = ({ title }: TitleProps) => {
  return (
    <div className={styles.container}>
      <h1>{title}</h1>
    </div>
  );
};
