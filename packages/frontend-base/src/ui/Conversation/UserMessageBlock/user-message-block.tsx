import styles from "./user-message-block.module.css";

type UserMessageBlockProps = {
  message: string;
};

export const UserMessageBlock = ({ message }: UserMessageBlockProps) => {
  return <div className={styles.container}>{message}</div>;
};
