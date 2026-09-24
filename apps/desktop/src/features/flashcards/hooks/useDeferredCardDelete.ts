import type { Flashcard } from "@/types";
import { toast } from "@tau/ui";
import { useEffect, useRef, useState } from "react";
import type { FlashcardMutations } from "../queries";

const UNDO_MS = 5000;

export function useDeferredCardDelete(mutations: Pick<FlashcardMutations, "deleteCard">) {
  /* 删除暂存：立即从视图消失，UNDO_MS 后真正落库；撤销即取消；离开页面时立刻落库 */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<number>>(() => new Set());
  const deleteTimers = useRef(new Map<number, number>());
  const commitDelete = (id: number) => {
    if (!deleteTimers.current.has(id)) return;
    window.clearTimeout(deleteTimers.current.get(id));
    deleteTimers.current.delete(id);
    mutations
      .deleteCard(id)
      .catch(() => toast.error("删除失败"))
      .finally(() =>
        setPendingDelete(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        })
      );
  };
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(
    () => () => {
      for (const id of [...deleteTimers.current.keys()]) commitRef.current(id);
    },
    []
  );
  const scheduleDelete = (card: Flashcard) => {
    if (deleteTimers.current.has(card.id)) return;
    setPendingDelete(prev => new Set(prev).add(card.id));
    deleteTimers.current.set(
      card.id,
      window.setTimeout(() => commitRef.current(card.id), UNDO_MS)
    );
    toast.info("已删除闪卡", {
      duration: UNDO_MS,
      action: {
        label: "撤销",
        onClick: () => {
          if (!deleteTimers.current.has(card.id)) return;
          window.clearTimeout(deleteTimers.current.get(card.id));
          deleteTimers.current.delete(card.id);
          setPendingDelete(prev => {
            const next = new Set(prev);
            next.delete(card.id);
            return next;
          });
        },
      },
    });
  };

  return { pendingDelete, scheduleDelete };
}
