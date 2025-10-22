"use client";

import { Link, Text } from "../../..";
import CheckAnimatedIcon from "../../ui/Icons/AnimatedCheck/AnimatedCheck";
import ThreeDotsLoadingIcon from "../../ui/Icons/ThreeDotsLoadingIcon/ThreeDotsLoadingIcon";
import { InvalidVerificationToken } from "../InvalidVerificationToken";
import { InvalidMessage } from "../Messages/InvalidMessage";
import { VerificationLinkAlreadyUsed } from "../VerificationLinkAlreadyUsed";
import styles from "./VerifyEmail.module.css";
import { useVerifyEmail } from "./useVerifyEmail";

export function ConfirmedEmailVerification() {
  const { isLoading, error } = useVerifyEmail();

  if (isLoading) {
    return <ThreeDotsLoadingIcon color="var(--brand)" />;
  }

  if (error?.value === "INVALID_VERIFICATION_TOKEN") {
    return <InvalidVerificationToken />;
  }
  if (
    ["VERIFICATION_LINK_ALREADY_USED", "USER_ALREADY_VERIFIED"].includes(
      error?.value ?? "",
    )
  ) {
    return <VerificationLinkAlreadyUsed />;
  }
  if (error) {
    return (
      <InvalidMessage
        title="There was an error"
        disclaimer="We couldn't confirm your email, please try again later."
      />
    );
  }

  return (
    <div className={styles.container}>
      <br />
      <div className={styles.head}>
        <Text variant="h1" weight="bold" size="1.5rem">
          Email verified.
        </Text>
        <CheckAnimatedIcon height="16" width="16" color="var(--brand)" />
      </div>
      <Text size="0.75rem">Your email was confirmed successfully.</Text>
      <br />

      <Link.Button href="/" data-astro-reload>
        Go to Home
      </Link.Button>
    </div>
  );
}
