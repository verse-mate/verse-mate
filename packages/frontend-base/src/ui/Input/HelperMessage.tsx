import styles from "./Input.module.css";

interface InputHelperMessageProps {
  message?: string;
}

export function InputHelperMessage({ message }: InputHelperMessageProps) {
  return (
    <span className={styles.helperMessage} hidden={Boolean(!message)}>
      {message}
    </span>
  );
}
