import type { TranslationValues } from "@tau/i18n";
import type { AppFeedbackResult } from "@/types/app-feedback";
import type { FeedbackMessageKey } from "./i18n";
export class FeedbackHostError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly params?: Record<string, string | number | boolean>
  ) {
    super(message);
    this.name = "FeedbackHostError";
  }
}
export type FeedbackIssue =
  | { kind: "message"; key: FeedbackMessageKey; values?: TranslationValues }
  | { kind: "cause"; cause: unknown; fallback: FeedbackMessageKey }
  | { kind: "response"; response: Extract<AppFeedbackResult, { ok: false }> };
