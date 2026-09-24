import type { FlashcardType } from "@/types";
import {
  CircleDot,
  ListChecks,
  MessageSquareText,
  TextCursorInput,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";

export const TYPE_ICON: Record<FlashcardType, LucideIcon> = {
  qa: MessageSquareText,
  cloze: TextCursorInput,
  "single-choice": CircleDot,
  "multiple-choice": ListChecks,
  boolean: ToggleRight,
};
