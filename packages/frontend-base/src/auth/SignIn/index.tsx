"use client";

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
import { OrDivider, SSOButtons } from "../SSOButtons";
import sharedStyles from "../sharedStyles.module.css";
import { useSignInForm } from "./useSignInForm";

export function SignIn({ onSwitch }: { onSwitch?: (mode: "signup") => void }) {
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
    // Redirect to Google OAuth endpoint
    window.location.href = "/api/auth/sso/google/redirect";
  }, []);

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
    // Redirect to Apple OAuth endpoint
    window.location.href = "/api/auth/sso/apple/redirect";
  }, []);

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

      {/* SSO Buttons */}
      <SSOButtons
        onGoogleClick={handleGoogleClick}
        onAppleClick={handleAppleClick}
        isLoading={ssoLoading}
        loadingProvider={ssoLoadingProvider}
      />

      {/* Or Divider */}
      <OrDivider />

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
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "var(--spring-wood, #fef2f2)",
              border: "1px solid var(--salmon, #f87171)",
              marginBottom: "16px",
            }}
          >
            <Text
              color="var(--vivid-burgundy, #9f1b2f)"
              size="14px"
              weight="500"
              style={{ display: "block", marginBottom: "4px" }}
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
                  style={{ display: "block", opacity: 0.8 }}
                >
                  {getSSOErrorActionSuggestion(backendError)}
                </Text>
              ) : (
                isRetryableError(backendError) && (
                  <Text
                    color="var(--vivid-burgundy, #9f1b2f)"
                    size="12px"
                    style={{ display: "block", opacity: 0.8 }}
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
            style={{
              color: "var(--white)",
              textDecoration: "underline",
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              cursor: "pointer",
            }}
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
