export const normalizeWebviewUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
    return trimmed;
  }

  if (
    trimmed.startsWith("~") ||
    trimmed.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

export const getWebviewTitleFromUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname || value;
  } catch {
    return value;
  }
};
