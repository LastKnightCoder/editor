const DISABLE_SCOPE_FALLBACK = "unknown-host";

export function getToolbarDisableScopeFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.trim().toLowerCase();
    if (hostname) {
      return hostname;
    }

    const origin = parsed.origin.trim().toLowerCase();
    if (origin && origin !== "null") {
      return origin;
    }

    return parsed.protocol.replace(/:$/, "") || DISABLE_SCOPE_FALLBACK;
  } catch {
    return DISABLE_SCOPE_FALLBACK;
  }
}

export function buildScopedToolbarDisableKey(baseKey: string, url: string) {
  return `${baseKey}:${getToolbarDisableScopeFromUrl(url)}`;
}
