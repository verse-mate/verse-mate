"use client";

import { Button, Link } from "../../..";
import { Input } from "../../ui/Input";
import { Text } from "../../ui/Text/Text";
import {
  getErrorActionSuggestion,
  isRetryableError,
} from "../../utils/error-handling";
import { PasswordRequirements } from "../PasswordRequirements";
import sharedStyles from "../sharedStyles.module.css";
import { useSignUpForm } from "./useSignUpForm";

export function SignUp({ onSwitch }: { onSwitch?: (mode: "login") => void }) {
  const {
    hookForm: { register, formState, watch },
    isLoading,
    onSubmit,
    backendError,
    clearBackendError,
  } = useSignUpForm();

  const password = watch("password");

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
              {backendError.message}
            </Text>
            {isRetryableError(backendError) && (
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
          Create account
        </Button>
      </form>
      <Text align="center" color="var(--gray)">
        Already have an account?{" "}
        {onSwitch ? (
          <button
            type="button"
            onClick={() => onSwitch("login")}
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
