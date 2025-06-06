import { useCallback } from "react";

import { api } from "backend-api";
import { LinkOffIcon } from "../../..";
import { ErrorLayout } from "../ErrorLayout";
import styles from "../ErrorLayout/ErrorLayout.module.css";
import { SUPPORT_EMAIL } from "../lib";

export const VerificationLinkAlreadyUsed = () => {
  const handleNewVerificationLink = useCallback(() => {
    api.auth["send-email-verification"].post();

    window.location.href = "/verify-email";
  }, []);

  return (
    <ErrorLayout
      title="Oops! This Verification Link Has Already Been Used."
      subTitle="For security reasons, each verification link can only be used once."
      icon={<LinkOffIcon />}
      footer={
        <>
          If you believe this is a mistake or if you need assistance, please{" "}
          <a className={styles.link} href={`mailto:${SUPPORT_EMAIL}`}>
            contact our support team.
          </a>
        </>
      }
      onClickRedirect={handleNewVerificationLink}
    />
  );
};
