import { localizedErrorMessage } from "./errors.i18n";
export type ParsedInvokeError = {
  code: string;
  message: string;
};

export function parseInvokeError(error: unknown): ParsedInvokeError {
  const raw = String(error ?? "")
    .trim()
    .replace(/^Error:\s*/, "");
  if (/^Command\s+.+\s+not found$/i.test(raw)) {
    return {
      code: "TAURI_COMMAND_NOT_FOUND",
      message: raw,
    };
  }
  if (raw.includes(":")) {
    const [code, ...rest] = raw.split(":");
    return {
      code: code.trim(),
      message: rest.join(":").trim(),
    };
  }
  return {
    code: raw.trim(),
    message: raw.trim(),
  };
}

export function mapErrorToMessage(code: string, fallback: string): string {
  const localized = localizedErrorMessage(code);
  if (localized !== undefined) return localized;
  return fallback;
}
