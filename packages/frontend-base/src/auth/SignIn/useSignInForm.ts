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

export function useSignInForm() {
  const [backendError, setBackendError] = useState<ErrorState | undefined>(
    undefined,
  );

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

      // Check device type for redirection
      const isDesktop =
        typeof window !== "undefined" && window.innerWidth >= 1024;

      if (isDesktop) {
        // For desktop: redirect to commentary tab and close hamburger menu
        localStorage.setItem("postLoginRedirect", "desktop");
      } else {
        // For mobile/tablet: redirect to Bible page and close hamburger menu
        localStorage.setItem("postLoginRedirect", "mobile");
      }

      // Redirect to the stored location or default to root
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
    // Always store the current location, even if bookId and verseId are not present
    // This will ensure we return to the same location after login
    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      const currentBookId = currentUrl.searchParams.get("bookId");
      const currentVerseId = currentUrl.searchParams.get("verseId");
      const currentExplanationType =
        currentUrl.searchParams.get("explanationType");

      // Store current location in localStorage
      if (currentBookId && currentVerseId) {
        localStorage.setItem(
          "redirectTo",
          `/?bookId=${currentBookId}&verseId=${currentVerseId}`,
        );
      } else {
        // If no specific location, store the current path
        localStorage.setItem(
          "redirectTo",
          window.location.pathname + window.location.search,
        );
      }

      // Store current explanation type
      if (currentExplanationType) {
        localStorage.setItem(
          "postLoginExplanationType",
          currentExplanationType,
        );
      }
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
