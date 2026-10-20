import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import type { FlashcardReferenceInput } from "@/types";
import { openFlashcardCreation } from "@/services/flashcard-creation";
import { toast } from "@tau/ui";

export default function useFlashcardCreation(options: {
  getContent(): Descendant[];
  getReference(): FlashcardReferenceInput;
}) {
  const open = useMemoizedFn((mode: "manual" | "ai") => {
    void openFlashcardCreation({
      mode,
      content: options.getContent(),
      references: [options.getReference()],
    }).catch(error => toast.error(error instanceof Error ? error.message : "打开制卡窗口失败"));
  });
  return {
    openManualFlashcard: () => open("manual"),
    openAiFlashcard: () => open("ai"),
  };
}
