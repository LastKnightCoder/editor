import { invoke } from "@/electron";
import {
  FlashcardDeck,
  CreateFlashcardDeckInput,
  UpdateFlashcardDeckInput,
  Flashcard,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  FlashcardReviewPayload,
  FlashcardQueueRequest,
  FlashcardReviewStats,
} from "@/types";

export function listFlashcardDecks(): Promise<FlashcardDeck[]> {
  return invoke("flashcard:list-decks");
}

export function getFlashcardDeck(id: number): Promise<FlashcardDeck | null> {
  return invoke("flashcard:get-deck", id);
}

export function createFlashcardDeck(payload: CreateFlashcardDeckInput): Promise<FlashcardDeck> {
  return invoke("flashcard:create-deck", payload);
}

export function updateFlashcardDeck(
  payload: UpdateFlashcardDeckInput
): Promise<FlashcardDeck | null> {
  return invoke("flashcard:update-deck", payload);
}

export function deleteFlashcardDeck(id: number): Promise<boolean> {
  return invoke("flashcard:delete-deck", id);
}

export function listFlashcards(params?: {
  deckId?: number;
  search?: string;
  tag?: string;
  limit?: number;
  statuses?: Flashcard["status"][];
}): Promise<Flashcard[]> {
  return invoke("flashcard:list-cards", params ?? {});
}

export function getFlashcard(id: number): Promise<Flashcard | null> {
  return invoke("flashcard:get-card", id);
}

export function createFlashcard(payload: CreateFlashcardInput): Promise<Flashcard> {
  return invoke("flashcard:create-card", payload);
}

export function updateFlashcard(payload: UpdateFlashcardInput): Promise<Flashcard | null> {
  return invoke("flashcard:update-card", payload);
}

export function deleteFlashcard(id: number): Promise<boolean> {
  return invoke("flashcard:delete-card", id);
}

export function getFlashcardReviewQueue(params?: FlashcardQueueRequest): Promise<Flashcard[]> {
  return invoke("flashcard:get-review-queue", params ?? {});
}

export function submitFlashcardReview(payload: FlashcardReviewPayload): Promise<Flashcard | null> {
  return invoke("flashcard:submit-review", payload);
}

/** 统计页聚合：since（毫秒时间戳）以来的评分分布 + 未来 7 天到期分桶 */
export function getFlashcardReviewStats(params?: {
  since?: number;
}): Promise<FlashcardReviewStats> {
  return invoke("flashcard:review-stats", params ?? {});
}
