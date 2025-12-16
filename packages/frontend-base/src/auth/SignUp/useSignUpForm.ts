"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import posthog from "posthog-js";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api } from "backend-api";
import { AnalyticsEvent, analytics } from "../../analytics";
import useMutation from "../../hooks/useMutation";
import { useGetSearchParams } from "../../hooks/useSearchParams";
import { setCookie } from "../../utils/auth-utils";
import { type ErrorState, processError } from "../../utils/error-handling";
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

/**
 * Decodes a JWT token to extract the payload.
 * Returns null if decoding fails.
 */
function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

export function useSignUpForm() {
  const [backendError, setBackendError] = useState<ErrorState | undefined>(
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

      // Get user info for analytics
      const email = getValues("email");
      const firstName = getValues("firstName");
      const lastName = getValues("lastName");
      const jwtPayload = decodeJwtPayload(data.accessToken);
      const userId = jwtPayload?.sub;

      if (userId && email) {
        try {
          // Identify user in PostHog
          posthog.identify(userId, { email });

          // Set user properties for email signup
          analytics.setUserProperties({
            email,
            firstName,
            lastName,
            account_type: "email",
            is_registered: true,
          });

          // Track SIGNUP_COMPLETED event
          analytics.track(AnalyticsEvent.SIGNUP_COMPLETED, {
            method: "email",
          });

          // Also track LOGIN_COMPLETED since signup is also a login
          analytics.track(AnalyticsEvent.LOGIN_COMPLETED, {
            method: "email",
          });
        } catch (error) {
          // PostHog may not be initialized (e.g., in development without API key)
          console.debug("PostHog tracking skipped:", error);
        }
      }

      const redirectTo = localStorage.getItem("redirectTo");
      localStorage.removeItem("redirectTo");
      window.location.href = redirectTo || "/";
    },
    onError: (error) => {
      console.error({ error });

      // Use enhanced error processing with debugging
      const errorState = processError(error, "SignUp");
      setBackendError(errorState);
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
