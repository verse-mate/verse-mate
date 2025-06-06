"use client";

import { Button, Link } from "../../..";
import { Input } from "../../ui/Input";
import { Text } from "../../ui/Text/Text";
import { PasswordRequirements } from "../PasswordRequirements";
import sharedStyles from "../sharedStyles.module.css";
import { useSignUpForm } from "./useSignUpForm";

export function SignUp() {
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

        <Text hidden={Boolean(!backendError)} color="var(--error)">
          {backendError}
        </Text>

        <Button type="submit" loading={isLoading}>
          Create account
        </Button>
      </form>
      <Text align="center" color="var(--gray)">
        Already have an account? <Link href="/login">Login</Link>
      </Text>
      <Text align="center" color="var(--gray)">
        <Link href="/">Continue without an account</Link>
      </Text>
    </div>
  );
}
