"use client";

import { useCallback, useState } from "react";

interface BasicError {
  message: string;
  value?: string;
}

type ApiResponse<T> = {
  data?: T;
  error?: any;
};

interface UseMutationOptions<T, Args extends any[]> {
  mutationFn: (...args: Args) => Promise<ApiResponse<T>>;
  onSuccess?: (response: ApiResponse<T>) => void;
  onError?: (error: BasicError) => void;
}

interface MutationResult<T, Args extends any[]> {
  data: T | null;
  isLoading: boolean;
  error: BasicError | null;
  mutateAsync: (...args: Args) => Promise<T | BasicError>;
}

function useMutation<T, Args extends any[] = []>(
  options: UseMutationOptions<T, Args>,
): MutationResult<T, Args> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<BasicError | null>(null);

  const mutateAsync = useCallback(
    async (...args: Args) => {
      setIsLoading(true);
      try {
        const response = await options.mutationFn(...args);

        if (response.error) {
          setError(response.error);
          if (options.onError) {
            options.onError(response.error);
          }
        } else if (response.data) {
          setData(response.data);
          if (options.onSuccess) {
            options.onSuccess(response);
          }
        }

        return response;
      } catch (err: any) {
        const errorObj: BasicError = {
          message: err.message || "An unexpected error occurred.",
        };
        setError(errorObj);
        if (options.onError) {
          options.onError(errorObj);
        }

        return err;
      } finally {
        setIsLoading(false);
      }
    },
    [options.onSuccess, options.onError, options.mutationFn],
  );

  return { data, isLoading, error, mutateAsync };
}

export default useMutation;
