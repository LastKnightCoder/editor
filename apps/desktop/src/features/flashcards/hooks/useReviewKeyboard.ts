import { isEditableTarget } from "@/page/dom";
import type { Flashcard, FlashcardReviewRating } from "@/types";
import { useEffect, useRef } from "react";
import { RATINGS, type ReviewAnswer } from "../model";
import { overlayOpen } from "../overlay";
import { LETTERS } from "../reviewStyles";

export function useReviewKeyboard({
  card,
  revealed,
  suggestion,
  busy,
  submit,
  rate,
  undo,
  suspend,
  pickOption,
  onEdit,
}: {
  card: Flashcard | undefined;
  revealed: boolean;
  suggestion: FlashcardReviewRating | null;
  busy: boolean;
  submit(answer?: ReviewAnswer): void;
  rate(rating: FlashcardReviewRating): Promise<void>;
  undo(): Promise<void>;
  suspend(): void;
  pickOption(id: string): void;
  onEdit(card: Flashcard): void;
}) {
  /* 键盘：浮层（编辑 Dialog / 菜单）打开时让位；输入框内只保留其自身按键 */
  const handlers = useRef({ submit, rate, undo, suspend, pickOption, onEdit });
  handlers.current = { submit, rate, undo, suspend, pickOption, onEdit };
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || busy || overlayOpen()) return;
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      const h = handlers.current;
      const undoKey = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (undoKey) {
        e.preventDefault();
        void h.undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !card) return;
      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        h.onEdit(card);
      } else if (key === "s") {
        e.preventDefault();
        h.suspend();
      } else if (!revealed) {
        const options = card.data.options ?? [];
        const letter = LETTERS.toLowerCase().indexOf(key);
        if (
          (card.type === "single-choice" || card.type === "multiple-choice") &&
          letter >= 0 &&
          letter < options.length
        ) {
          e.preventDefault();
          h.pickOption(options[letter].id);
        } else if (card.type === "boolean" && (key === "a" || key === "b")) {
          e.preventDefault();
          h.submit({ bool: key === "a" });
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          h.submit();
        }
      } else {
        const rating = RATINGS.find(r => r.key === e.key);
        if (rating) {
          e.preventDefault();
          void h.rate(rating.value);
        } else if ((e.key === " " || e.key === "Enter") && suggestion) {
          e.preventDefault();
          void h.rate(suggestion);
        }
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [card, revealed, suggestion, busy]);
}
