import Link from "next/link";
import { Button } from "../../Button/Button";
import { VerseMateLogoExtended } from "../../Icons";
import { Text } from "../../Text/Text";
import styles from "./content.module.css";

type ContentProps = {} & React.HTMLAttributes<HTMLDivElement>;

export const Content = ({ ...rest }: ContentProps) => {
  return (
    <>
      <div className={styles.background} />

      <div className={styles.content}>
        <span className={styles.logo}>
          <VerseMateLogoExtended height={240} width={240} />
        </span>

        <div className={styles.buttonsContainer}>
          <Link href={"/login"}>
            <Button className={styles.signInButton}>Sign In</Button>
          </Link>

          <Text className={styles.signUpContainer}>
            <span className={styles.simpleText}>Don't have account?</span>
            <Link href="/create-account" className={styles.signUpLink}>
              Create New Account
            </Link>
          </Text>
        </div>
      </div>
    </>
  );
};
