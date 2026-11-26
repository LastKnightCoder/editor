import { parseInvokeError } from "../../../services/errors";
export interface AppUpdateFailure {
  code: string;
  diagnostic: string;
  cause: unknown;
}
export function captureAppUpdateFailure(cause: unknown): AppUpdateFailure {
  const parsed = parseInvokeError(cause);
  return { code: parsed.code, diagnostic: parsed.message, cause };
}
