import type { JsonValue } from "@tau/plugins";

const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|credential)/i;

function collectSecrets(value: JsonValue | undefined, output: string[] = []): string[] {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectSecrets(item, output);
    return output;
  }
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && typeof item === "string" && item) output.push(item);
    else collectSecrets(item, output);
  }
  return output;
}

export function isTtsAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function ttsErrorMessage(
  error: unknown,
  config?: JsonValue,
  fallback = "语音操作失败，请稍后重试"
): string {
  let message = error instanceof Error ? error.message : String(error ?? "");
  const secrets = collectSecrets(config).sort((a, b) => b.length - a.length);
  for (const secret of secrets) message = message.split(secret).join("•••");
  return message.trim() || fallback;
}
