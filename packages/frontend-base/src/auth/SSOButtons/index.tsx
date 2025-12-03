"use client";

import type { ReactNode } from "react";
import { Text } from "../../ui/Text/Text";
import styles from "./SSOButtons.module.css";

export interface SSOButtonsProps {
  onGoogleClick?: () => void;
  onAppleClick?: () => void;
  isLoading?: boolean;
  loadingProvider?: "google" | "apple" | null;
  /** Feature flag to show/hide Google SSO button */
  googleEnabled?: boolean;
  /** Feature flag to show/hide Apple SSO button */
  appleEnabled?: boolean;
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z"
        fill="#4285F4"
      />
      <path
        d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M15.2438 14.0625C14.9625 14.7188 14.6344 15.3281 14.2594 15.8906C13.7438 16.6406 13.3219 17.1562 13 17.4375C12.5063 17.8875 11.9813 18.1219 11.425 18.1406C11.0188 18.1406 10.5281 18.0281 9.95625 17.7937C9.38437 17.5594 8.85938 17.4469 8.38125 17.4469C7.87813 17.4469 7.3375 17.5594 6.75938 17.7937C6.18125 18.0281 5.71563 18.1406 5.35938 18.1406C4.8375 18.1594 4.29688 17.9156 3.7375 17.4094C3.38438 17.1 2.94375 16.5656 2.41563 15.8062C1.85 15 1.3875 14.0906 1.02813 13.0781C0.64375 11.9906 0.453125 10.9406 0.453125 9.92812C0.453125 8.76562 0.703125 7.76562 1.20313 6.93C1.59688 6.26249 2.11563 5.74062 2.75938 5.36562C3.40313 4.99062 4.10 4.8 4.85 4.7875C5.28125 4.7875 5.84062 4.91875 6.53125 5.175C7.21875 5.43125 7.66563 5.5625 7.87188 5.5625C8.02813 5.5625 8.52188 5.40937 9.31875 5.10312C10.0719 4.81875 10.7156 4.7 11.2531 4.74375C12.6844 4.8625 13.7719 5.4 14.5094 6.36562C13.2281 7.13437 12.5938 8.20937 12.6094 9.58437C12.625 10.6594 13.0156 11.5562 13.7781 12.2687C14.1344 12.6062 14.5312 12.8656 14.9719 13.0469C14.8625 13.3656 14.7469 13.6719 14.625 13.9656L15.2438 14.0625ZM11.35 0.36C11.35 1.19062 11.0344 1.96875 10.4031 2.69062C9.64688 3.54687 8.73125 4.0375 7.74062 3.9625C7.725 3.8625 7.71562 3.75625 7.71562 3.64375C7.71562 2.84687 8.075 1.99687 8.7125 1.29375C9.03125 0.9375 9.44062 0.64375 9.94062 0.4125C10.4406 0.184375 10.9125 0.059375 11.3562 0.0375C11.3719 0.14375 11.3781 0.25 11.3781 0.35625L11.35 0.36Z"
        fill="white"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className={styles.spinner}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        className={styles.spinnerTrack}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      <path
        className={styles.spinnerHead}
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

interface SSOButtonProps {
  children: ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  variant: "google" | "apple";
  icon: ReactNode;
  "aria-label"?: string;
}

function SSOButton({
  children,
  onClick,
  isLoading,
  variant,
  icon,
  "aria-label": ariaLabel,
}: SSOButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.ssoButton} ${styles[variant]}`}
      onClick={onClick}
      disabled={isLoading}
      aria-label={ariaLabel}
      aria-busy={isLoading}
    >
      <span className={styles.iconWrapper}>
        {isLoading ? <LoadingSpinner /> : icon}
      </span>
      <span className={styles.buttonText}>{children}</span>
    </button>
  );
}

export function SSOButtons({
  onGoogleClick,
  onAppleClick,
  isLoading = false,
  loadingProvider = null,
  googleEnabled = false,
  appleEnabled = false,
}: SSOButtonsProps) {
  // If neither provider is enabled, don't render anything
  if (!googleEnabled && !appleEnabled) {
    return null;
  }

  return (
    <div className={styles.container} data-testid="sso-buttons">
      {googleEnabled && (
        <SSOButton
          variant="google"
          icon={<GoogleIcon />}
          onClick={onGoogleClick}
          isLoading={isLoading && loadingProvider === "google"}
          aria-label="Continue with Google"
        >
          Continue with Google
        </SSOButton>
      )}
      {appleEnabled && (
        <SSOButton
          variant="apple"
          icon={<AppleIcon />}
          onClick={onAppleClick}
          isLoading={isLoading && loadingProvider === "apple"}
          aria-label="Continue with Apple"
        >
          Continue with Apple
        </SSOButton>
      )}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className={styles.divider} aria-hidden="true">
      <span className={styles.dividerLine} />
      <Text color="var(--gray)" size="14px" className={styles.dividerText}>
        or
      </Text>
      <span className={styles.dividerLine} />
    </div>
  );
}
