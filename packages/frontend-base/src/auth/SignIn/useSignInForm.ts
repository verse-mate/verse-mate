"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api } from "backend-api";
import useMutation from "../../hooks/useMutation";
import { setCookie } from "../../utils/auth-utils";
import { type ErrorState, processError } from "../../utils/error-handling";
import { ACCESS_TOKEN_COOKIE, zodEmail } from "../lib";

export interface SignInData {
  email: string;
  password: string;
}

const schema = z.object({
  email: zodEmail,
  password: z
    .string()
    .min(8, "Password must have at least 8 characters.")
    .max(64, "Password must have maximum of 64 characters."),
});

import { useGetSearchParams } from "../../hooks/useSearchParams";

export function useSignInForm() {
  const [backendError, setBackendError] = useState<ErrorState | undefined>(
    undefined,
  );
  const { bookId, verseId, explanationType } = useGetSearchParams();

  const { handleSubmit, register, formState, getValues } = useForm<SignInData>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
  });

  const { mutateAsync: login, isLoading } = useMutation({
    mutationFn: api.auth.login.post,
    onSuccess: ({ data }) => {
      if (!data?.accessToken) {
        return console.error("Empty access token");
      }
      setCookie(ACCESS_TOKEN_COOKIE, data.accessToken, 7);
      const redirectTo = localStorage.getItem("redirectTo");
      localStorage.removeItem("redirectTo");
      window.location.href = redirectTo || "/";
    },
    onError: (error) => {
      console.error({ error });

      // Use enhanced error processing with debugging
      const errorState = processError(error, "SignIn");
      setBackendError(errorState);
    },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    if (bookId && verseId) {
      localStorage.setItem(
        "redirectTo",
        `/?bookId=${bookId}&verseId=${verseId}`,
      );
      localStorage.setItem("postLoginExplanationType", explanationType);
    }
    await login({
      email,
      password,
    });
  });

  const clearBackendError = useCallback(() => {
    setBackendError(undefined);
  }, []);

  return {
    hookForm: {
      formState,
      register,
      getValues,
    },
    onSubmit,
    isLoading,
    backendError,
    clearBackendError,
  };
}
