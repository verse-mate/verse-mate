import { useRouter } from "next/navigation";
import { Button } from "../ui/Button/Button";
import { VerseMateLogoExtended } from "../ui/Icons";
import styles from "./style.module.css";

export const Page = () => {
  const router = useRouter();

  return (
    <>
      <div className={styles.background} />
      <main className={styles.container}>
        <div className={styles.content}>
          <span className={styles.logo}>
            <VerseMateLogoExtended height={240} width={240} />
          </span>

          <div className={`${styles.descriptionContainer}`}>
            <span className={`${styles.statusCode}`}>404</span>
            <span className={`${styles.statusDescription}`}>
              Page not found
            </span>
            <div className={styles.simpleText}>
              <p>The page you tried to access does not exist.</p>
              <p>Click the button below to return to the application.</p>
            </div>

            <Button className={styles.button} onClick={() => router.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </main>
    </>
  );
};
