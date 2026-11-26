import { type FlashcardMessageKey } from "./i18n";
export class FlashcardError extends Error {
  readonly code = "FLASHCARD_DOMAIN_ERROR";
  constructor(
    message: string,
    readonly messageKey: FlashcardMessageKey
  ) {
    super(message);
    this.name = "FlashcardError";
  }
}
