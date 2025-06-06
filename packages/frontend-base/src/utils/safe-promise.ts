export const safePromise = async <T>(
  promise: Promise<T>,
): Promise<[T, null] | [null, Error]> => {
  try {
    const value = await promise;
    return [value, null];
  } catch (error) {
    return [null, error as Error];
  }
};
