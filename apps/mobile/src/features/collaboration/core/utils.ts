import { parseInvokeError } from "../../../services/errors";

export function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function canRetryRead(error: unknown) {
  const { code } = parseInvokeError(error);
  return (
    [
      "COLLAB_NETWORK",
      "COLLAB_TIMEOUT",
      "COLLAB_REQUEST_FAILED",
      "COLLAB_RATE_LIMITED",
      "COLLAB_CAPACITY",
      "COLLAB_MAINTENANCE",
    ].includes(code) || /^COLLAB_HTTP_(429|5\d\d)$/.test(code)
  );
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
