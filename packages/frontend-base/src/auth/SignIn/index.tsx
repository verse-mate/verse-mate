"use client";

import { Button, Link } from "../../..";
import { Input } from "../../ui/Input";
import { Text } from "../../ui/Text/Text";
import sharedStyles from "../sharedStyles.module.css";
import { useSignInForm } from "./useSignInForm";

export function SignIn() {
  const {
    hookForm: { register, formState },
    onSubmit,
    isLoading,
    backendError,
    clearBackendError,
  } = useSignInForm();

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
          <Input type="email" autoComplete="off" {...register("email")} />
          <Input.Message message={formState.errors.email?.message} />
        </Input.Root>

        <Input.Root hasError={Boolean(formState.errors.password)}>
          <Input.Label label="Password" />
          <Input.Password {...register("password")} />
          <Input.Message message={formState.errors.password?.message} />
        </Input.Root>
        {/* <Link href="/forgot-password">Forgot password?</Link> */}

        <Text hidden={Boolean(!backendError)} color="var(--error)">
          {backendError}
        </Text>
        <Button type="submit" loading={isLoading}>
          Login
        </Button>
      </form>
      <Text align="center" color="var(--gray)">
        Don't have account?{" "}
        <Link href="/create-account">Create New Account</Link>
      </Text>
      <Text align="center" color="var(--gray)">
        <Link href="/">Continue without an account</Link>
      </Text>
    </div>
  );
}
