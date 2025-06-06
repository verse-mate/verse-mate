"use client";
import { api } from "backend-api";
import { useState } from "react";
import useMutation from "../../hooks/useMutation";

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

    onSuccess: () => {
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
