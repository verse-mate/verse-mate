import { Text } from "../../..";
import styles from "./VerifyEmail.module.css";

export function VerifyEmail() {
  return (
    <div className={styles.container}>
      <Text variant="h1" weight="bold" size="2rem" className={styles.title}>
        Email Verification
      </Text>
      <Text size="1rem" color="var(--gray)" className={styles.message}>
        A verification email has been generated and transmitted to the email
        address you provided for us. Please check your inbox.
      </Text>
    </div>
  );
}
