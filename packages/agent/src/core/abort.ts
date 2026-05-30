export const createAbortError = (message = "操作已取消"): Error => {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
};

export const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { name?: unknown }).name === "AbortError";
};
