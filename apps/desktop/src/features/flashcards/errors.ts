import { type FlashcardsMessageKey } from "./i18n";
export class FlashcardsError extends Error {
  readonly code = "FLASHCARD_DOMAIN_ERROR";
  constructor(
    message: string,
    readonly messageKey: FlashcardsMessageKey,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "FlashcardsError";
  }
}
