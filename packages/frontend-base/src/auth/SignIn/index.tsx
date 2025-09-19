"use client";

import { useEffect, useRef } from "react";
import { Button, Link } from "../../..";
import { Input } from "../../ui/Input";
import { Text } from "../../ui/Text/Text";
import {
  getErrorActionSuggestion,
  isRetryableError,
} from "../../utils/error-handling";
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

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

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
              isRetryableError(backendError) && (
                <Text
                  color="var(--vivid-burgundy, #9f1b2f)"
                  size="12px"
                  style={{ display: "block", opacity: 0.8 }}
                >
                  {getErrorActionSuggestion(backendError)}
                </Text>
              )}
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
