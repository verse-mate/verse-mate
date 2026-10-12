"use client";
import { api } from "backend-api";
import { useState } from "react";
import useMutation from "../../hooks/useMutation";
import { setCookie } from "../../utils/auth-utils";
import { ACCESS_TOKEN_COOKIE } from "../lib";

const getKey = () => {
  const params = new URLSearchParams(document.location.search);
  const key = params.get("key");

  return key ?? "";
};

export function useVerifyEmail() {
  const [isLoading, setIsLoading] = useState(true);

  const { mutateAsync, error } = useMutation({
    mutationFn: api.auth["verify-email"].post,
    onError: () => {
      setIsLoading(false);
    },

    onSuccess: ({ data }) => {
      if (data?.accessToken)
        setCookie(ACCESS_TOKEN_COOKIE, data.accessToken, 90);
      setIsLoading(false);
    },
  });

  return {
    isLoading,
    mutateAsync,
    error,
    getKey,
  };
}
