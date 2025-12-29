"use client";

import { $env } from "frontend-envs";
import { useCallback, useState } from "react";
import { Button, Link } from "../../..";
import { Input } from "../../ui/Input";
import { Text } from "../../ui/Text/Text";
import {
  getErrorActionSuggestion,
  getSSOErrorActionSuggestion,
  isRetryableError,
  isSSOError,
} from "../../utils/error-handling";
import { useStore } from "../../utils/use-store";
import { PasswordRequirements } from "../PasswordRequirements";
import { OrDivider, SSOButtons } from "../SSOButtons";
import sharedStyles from "../sharedStyles.module.css";
import { useSignUpForm } from "./useSignUpForm";

export interface SignUpProps {
  onSwitch?: (mode: "login") => void;
}

export function SignUp({ onSwitch }: SignUpProps) {
  const { ssoGoogleEnabled, ssoAppleEnabled, apiUrl } = useStore($env, {
    keys: ["ssoGoogleEnabled", "ssoAppleEnabled", "apiUrl"],
  });
  const {
    hookForm: { register, formState, watch },
    isLoading,
    onSubmit,
    backendError,
    clearBackendError,
  } = useSignUpForm();

  const password = watch("password");

  // SSO loading state
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoLoadingProvider, setSsoLoadingProvider] = useState<
    "google" | "apple" | null
  >(null);

  const handleGoogleClick = useCallback(() => {
    setSsoLoading(true);
    setSsoLoadingProvider("google");
    // Store current redirect location before SSO redirect
    if (typeof window !== "undefined") {
      const existingRedirect = localStorage.getItem("redirectTo");
      if (!existingRedirect) {
        const pathname = window.location.pathname;
        if (
          pathname !== "/login" &&
          pathname !== "/signup" &&
          pathname !== "/create-account"
        ) {
          localStorage.setItem("redirectTo", pathname + window.location.search);
        }
      }
    }
    // Redirect to Google OAuth endpoint on backend
    window.location.href = `${apiUrl}/auth/sso/google/redirect`;
  }, [apiUrl]);

  const handleAppleClick = useCallback(() => {
    setSsoLoading(true);
    setSsoLoadingProvider("apple");
    // Store current redirect location before SSO redirect
    if (typeof window !== "undefined") {
      const existingRedirect = localStorage.getItem("redirectTo");
      if (!existingRedirect) {
        const pathname = window.location.pathname;
        if (
          pathname !== "/login" &&
          pathname !== "/signup" &&
          pathname !== "/create-account"
        ) {
          localStorage.setItem("redirectTo", pathname + window.location.search);
        }
      }
    }
    // Redirect to Apple OAuth endpoint on backend
    window.location.href = `${apiUrl}/auth/sso/apple/redirect`;
  }, [apiUrl]);

  // Determine if error is SSO-related for custom action suggestion
  const errorIsSSORelated = backendError && isSSOError(backendError);

  return (
    <div className={sharedStyles.wrapper}>
      <div className={sharedStyles.head}>
        <Text
          variant="h1"
          size="var(--font-tittle2)"
          align="center"
          weight="bold"
        >
          Create Account
        </Text>
        <Text align="center" color="var(--gray)">
          Please provide the following information to set up your account.
        </Text>
      </div>

      {/* SSO Buttons - only shown if at least one provider is enabled */}
      <SSOButtons
        onGoogleClick={handleGoogleClick}
        onAppleClick={handleAppleClick}
        isLoading={ssoLoading}
        loadingProvider={ssoLoadingProvider}
        googleEnabled={ssoGoogleEnabled}
        appleEnabled={ssoAppleEnabled}
      />

      {/* Or Divider - only shown if SSO is enabled */}
      {(ssoGoogleEnabled || ssoAppleEnabled) && <OrDivider />}

      <form
        className={sharedStyles.form}
        onSubmit={onSubmit}
        method="post"
        onChange={clearBackendError}
      >
        <div className={sharedStyles.responsiveRow}>
          <Input.Root hasError={Boolean(formState.errors.firstName)}>
            <Input.Label label="First name" />
            <Input autoComplete="off" {...register("firstName")} />
            <Input.Message message={formState.errors.firstName?.message} />
          </Input.Root>

          <Input.Root hasError={Boolean(formState.errors.lastName)}>
            <Input.Label label="Last name" />
            <Input autoComplete="off" {...register("lastName")} />
            <Input.Message message={formState.errors.lastName?.message} />
          </Input.Root>
        </div>

        <Input.Root hasError={Boolean(formState.errors.email)}>
          <Input.Label label="Email" />
          <Input type="email" autoComplete="off" {...register("email")} />
          <Input.Message message={formState.errors.email?.message} />
        </Input.Root>

        <Input.Root hasError={Boolean(formState.errors.password)}>
          <Input.Label label="Password" />
          <Input.Password {...register("password")} />
          <Input.Message message={formState.errors.password?.message} />
        </Input.Root>

        <PasswordRequirements password={password} />

        {/* Enhanced error display with better UX */}
        {backendError && (
          <div
            role="alert"
            aria-live="polite"
            className={sharedStyles.errorAlert}
          >
            <Text
              color="var(--vivid-burgundy, #9f1b2f)"
              size="14px"
              weight="500"
              className={sharedStyles.errorMessage}
            >
              {backendError.message}
            </Text>
            {errorIsSSORelated ? (
              <Text
                color="var(--vivid-burgundy, #9f1b2f)"
                size="12px"
                className={sharedStyles.errorSuggestion}
              >
                {getSSOErrorActionSuggestion(backendError)}
              </Text>
            ) : (
              isRetryableError(backendError) && (
                <Text
                  color="var(--vivid-burgundy, #9f1b2f)"
                  size="12px"
                  className={sharedStyles.errorSuggestion}
                >
                  {getErrorActionSuggestion(backendError)}
                </Text>
              )
            )}
          </div>
        )}

        <Button type="submit" loading={isLoading}>
          Create account
        </Button>
      </form>
      <Text align="center" color="var(--gray)">
        Already have an account?{" "}
        {onSwitch ? (
          <button
            type="button"
            onClick={() => onSwitch("login")}
            className={sharedStyles.switchButton}
          >
            Login
          </button>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </Text>
      <Text align="center" color="var(--gray)">
        <Link href="/">Continue without an account</Link>
      </Text>
    </div>
  );
}
