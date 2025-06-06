import { useCallback } from "react";

import { api } from "backend-api";
import { DomainVerificationIcon } from "../../..";
import { ErrorLayout } from "../ErrorLayout";
import styles from "../ErrorLayout/ErrorLayout.module.css";
import { SUPPORT_EMAIL } from "../lib";

export const InvalidVerificationToken = () => {
  const handleClickNewLink = useCallback(async () => {
    api.auth["send-email-verification"].post({
      $headers: {
        authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });

    window.location.href = "/verify-email";
  }, []);

  return (
    <ErrorLayout
      title="Invalid Verification Token"
      icon={<DomainVerificationIcon />}
      subTitle="We're sorry, but the verification link you tried to use is invalid."
      instructions="This could be due to an expired link, a typo in the URL, or the link being used for a different account. If you need a new link, you can request one below."
      redirectLabel="Request New Verification Link"
      footer={
        <>
          For further assistance or if you're encountering this issue
          repeatedly, please don't hesitate to{" "}
          <a className={styles.link} href={`mailto:${SUPPORT_EMAIL}`}>
            reach out to our support team
          </a>{" "}
          for help
        </>
      }
      onClickRedirect={handleClickNewLink}
    />
  );
};
