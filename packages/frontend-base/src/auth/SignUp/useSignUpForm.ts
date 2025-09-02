"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api } from "backend-api";
import useMutation from "../../hooks/useMutation";
import { setCookie } from "../../utils/auth-utils";
import { ACCESS_TOKEN_COOKIE, zodEmail, zodPassword } from "../lib";

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const schema: z.ZodType<SignUpData> = z.object({
  email: zodEmail,
  password: zodPassword,
  firstName: z
    .string()
    .min(1, "Required.")
    .max(250, "First name must have maximum of 250 characters."),
  lastName: z
    .string()
    .min(1, "Required.")
    .max(250, "Last name must have maximum of 250 characters."),
});

import { useGetSearchParams } from "../../hooks/useSearchParams";

export function useSignUpForm() {
  const [backendError, setBackendError] = useState<string | undefined>(
    undefined,
  );
  const { bookId, verseId } = useGetSearchParams();

  const { handleSubmit, register, formState, getValues, watch } =
    useForm<SignUpData>({
      resolver: zodResolver(schema),
      mode: "onChange",
    });

  const { mutateAsync: signup, isLoading } = useMutation({
    mutationFn: api.auth.signup.post,
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
      let errorMessage = "Something went wrong.";

      if (error.value === "ALREADY_EXISTS") {
        errorMessage =
          "This email is already registered, please try to create an account with a different one.";
      }

      setBackendError(errorMessage);
      console.error({ error });
    },
  });

  const onSubmit = handleSubmit(
    async ({ email, password, firstName, lastName }) => {
      if (bookId && verseId) {
        localStorage.setItem(
          "redirectTo",
          `/?bookId=${bookId}&verseId=${verseId}`,
        );
      }
      await signup({
        email,
        password,
        firstName,
        lastName,
      });
    },
  );

  const clearBackendError = useCallback(() => {
    setBackendError(undefined);
  }, []);

  return {
    hookForm: {
      handleSubmit,
      register,
      formState,
      getValues,
      watch,
    },

    backendError,
    clearBackendError,
    onSubmit,
    isLoading,
  };
}
