"use client";

import { $env } from "frontend-envs";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { OrDivider, SSOButtons } from "../SSOButtons";
import sharedStyles from "../sharedStyles.module.css";
import { useSignInForm } from "./useSignInForm";

export interface SignInProps {
  onSwitch?: (mode: "signup") => void;
}

export function SignIn({ onSwitch }: SignInProps) {
  const { ssoGoogleEnabled, ssoAppleEnabled, apiUrl } = useStore($env, {
    keys: ["ssoGoogleEnabled", "ssoAppleEnabled", "apiUrl"],
  });
  const {
    hookForm: { register, formState },
    onSubmit,
    isLoading,
    backendError,
    clearBackendError,
  } = useSignInForm();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const { ref: emailFormRef, ...emailRegisterProps } = register("email");

  // SSO loading state
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoLoadingProvider, setSsoLoadingProvider] = useState<
    "google" | "apple" | null
  >(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  // Capture URL parameters on mount and store them for post-login redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      const bookId = currentUrl.searchParams.get("bookId");
      const verseId = currentUrl.searchParams.get("verseId");
      const testament = currentUrl.searchParams.get("testament");
      const explanationType = currentUrl.searchParams.get("explanationType");

      // Only store if we have bookId and verseId, and redirectTo isn't already set
      if (bookId && verseId && !localStorage.getItem("redirectTo")) {
        const redirectParams = new URLSearchParams();
        redirectParams.set("bookId", bookId);
        redirectParams.set("verseId", verseId);

        if (testament) {
          redirectParams.set("testament", testament);
        }
        if (explanationType) {
          redirectParams.set("explanationType", explanationType);
        }

        localStorage.setItem("redirectTo", `/?${redirectParams.toString()}`);
      }
    }
  }, []);

  const handleGoogleClick = useCallback(() => {
    setSsoLoading(true);
    setSsoLoadingProvider("google");
    // Store current redirect location before SSO redirect
    if (typeof window !== "undefined") {
      const existingRedirect = localStorage.getItem("redirectTo");
      if (!existingRedirect) {
        const pathname = window.location.pathname;
        if (pathname !== "/login" && pathname !== "/signup") {
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
        if (pathname !== "/login" && pathname !== "/signup") {
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
          Welcome back
        </Text>
        <Text align="center" color="var(--gray)">
          Login into your account
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
        <Input.Root hasError={Boolean(formState.errors.email)}>
          <Input.Label label="Email" />
          <Input
            type="email"
            autoComplete="off"
            {...emailRegisterProps}
            ref={(e) => {
              emailFormRef(e);
              emailInputRef.current = e;
            }}
          />
          <Input.Message message={formState.errors.email?.message} />
        </Input.Root>

        <Input.Root hasError={Boolean(formState.errors.password)}>
          <Input.Label label="Password" />
          <Input.Password {...register("password")} />
          <Input.Message message={formState.errors.password?.message} />
        </Input.Root>
        {/* <Link href="/forgot-password">Forgot password?</Link> */}

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
              {typeof backendError === "string"
                ? backendError
                : backendError.message}
            </Text>
            {typeof backendError !== "string" &&
              (errorIsSSORelated ? (
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
              ))}
          </div>
        )}
        <Button type="submit" loading={isLoading}>
          Login
        </Button>
      </form>
      <Text align="center" color="var(--gray)">
        Don't have account?{" "}
        {onSwitch ? (
          <button
            type="button"
            onClick={() => onSwitch("signup")}
            className={sharedStyles.switchButton}
          >
            Create New Account
          </button>
        ) : (
          <Link href="/create-account">Create New Account</Link>
        )}
      </Text>
      <Text align="center" color="var(--gray)">
        <Link href="/">Continue without an account</Link>
      </Text>
    </div>
  );
}
